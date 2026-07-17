package feedback360

import (
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/col"
	"github.com/johnfercher/maroto/v2/pkg/components/page"
	"github.com/johnfercher/maroto/v2/pkg/components/row"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/align"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/core"
	"github.com/johnfercher/maroto/v2/pkg/props"
)

// Condensed ~8-12 page 360° report, styled after the org's full-length
// reference report (cover → intro → alignment → hidden strengths/blind spots →
// detailed results → narrative) but scoped down to what a handful of PDF pages
// reasonably holds instead of the reference's 30+ pages of repeated per-behavior
// blocks. A future iteration can grow this further without changing callers.

// ── Report data ────────────────────────────────────────────────────

// reportBehaviorDetail is one behavior's rolled-up scoring for the report,
// tagged Strength/Proficient/Growth area per the thresholds in the reference
// report's "About this report" section.
type reportBehaviorDetail struct {
	Statement string
	Overall   *float64 // avg across every non-self group that rated it
	Tag       string   // "Strength" | "Proficient" | "Growth area" | ""
	Groups    []reportGroupDetail
}

// reportGroupDetail is one relationship group's rating on one behavior.
type reportGroupDetail struct {
	Relationship string
	Label        string
	Avg          *float64
	Min          *float64
	Max          *float64
	Submitted    int
	Nominated    int
	// Importance is the avg "how important is this behavior for this person's
	// role" rating (1-5), only collected from manager/skip_level raters
	// (see importanceCategories in rater_service.go). Nil for every other
	// relationship group, and nil when no importance ratings were submitted.
	Importance *float64
}

// reportCompetencyDetail is one competency's report section: its own
// self-vs-others score plus every behavior underneath it.
type reportCompetencyDetail struct {
	Title       string
	SelfScore   *float64
	OthersScore *float64
	// ManagerScore is the avg of manager-relationship groups' behavior scores
	// for this competency, used as an optional third comparison bar on the
	// alignment page. Nil when the cycle has no manager raters/responses.
	ManagerScore *float64
	// Gap is SelfScore - OthersScore (positive = self rated higher than
	// others; negative = others rated higher than self). Threaded through
	// from the same formula buildParticipantReportData already computed for
	// the narrative's CompetencyScoreDTO, so the hidden-strengths/blind-spots
	// page can use it directly instead of recomputing.
	Gap       *float64
	Behaviors []reportBehaviorDetail
}

// ReportData is everything the PDF renderer needs — pre-computed so
// generateParticipantReportPDF has no DB access of its own.
type ReportData struct {
	ParticipantName string
	OrgName         string
	CycleName       string
	GeneratedOn     time.Time
	Competencies    []reportCompetencyDetail
	Narrative       string
}

// scoreTag applies the reference report's thresholds: Strength >= 4.0,
// Proficient 3.0-3.99, Growth area < 3.0.
func scoreTag(avg *float64) string {
	if avg == nil {
		return ""
	}
	switch {
	case *avg >= 4.0:
		return "Strength"
	case *avg >= 3.0:
		return "Proficient"
	default:
		return "Growth area"
	}
}

// hiddenStrengthGapThreshold / blindSpotGapThreshold mirror the reference
// report's "meaningfully different" bar for flagging hidden strengths and
// blind spots on the dedicated page (self vs. all-raters gap of half a point
// or more in either direction).
const (
	hiddenStrengthGapThreshold = -0.5 // self - others <= this => hidden strength
	blindSpotGapThreshold      = 0.5  // self - others >= this => blind spot
)

// buildParticipantReportData assembles the report content for one
// participant's panel on a cycle, using the same aggregation queries the
// Results tab and narrative already rely on (aggregateScores, composeNarrative)
// plus the per-behavior breakdown query (reportBehaviorBreakdown).
func buildParticipantReportData(cycle *FeedbackCycle, participantID uuid.UUID) (*ReportData, error) {
	comps, err := cycleCompetencies(cycle.ID)
	if err != nil {
		return nil, err
	}
	scores, err := aggregateScores(cycle.ID, participantID)
	if err != nil {
		return nil, err
	}
	scoreByComp := map[uuid.UUID]scoreRow{}
	for _, s := range scores {
		scoreByComp[s.CompetencyID] = s
	}

	breakdown, err := reportBehaviorBreakdown(cycle.ID, participantID)
	if err != nil {
		return nil, err
	}
	// Group breakdown rows by behavior, in snapshot order.
	behaviorOrder := []string{}
	behaviorMeta := map[string]struct {
		CompetencyID string
		Statement    string
		SortOrder    int
	}{}
	groupsByBehavior := map[string][]behaviorGroupRow{}
	for _, r := range breakdown {
		if _, ok := behaviorMeta[r.BehaviorID]; !ok {
			behaviorOrder = append(behaviorOrder, r.BehaviorID)
			behaviorMeta[r.BehaviorID] = struct {
				CompetencyID string
				Statement    string
				SortOrder    int
			}{r.CompetencyID, r.Statement, r.SortOrder}
		}
		if r.Relationship == "self" {
			continue // self is shown at the competency level, not per-behavior groups
		}
		groupsByBehavior[r.BehaviorID] = append(groupsByBehavior[r.BehaviorID], r)
	}
	sort.SliceStable(behaviorOrder, func(i, j int) bool {
		return behaviorMeta[behaviorOrder[i]].SortOrder < behaviorMeta[behaviorOrder[j]].SortOrder
	})

	behaviorsByComp := map[string][]reportBehaviorDetail{}
	// managerSumByComp / managerNByComp roll manager-relationship behavior
	// averages up to a per-competency manager score for the alignment page's
	// third comparison bar.
	managerSumByComp := map[string]float64{}
	managerNByComp := map[string]int{}
	for _, bid := range behaviorOrder {
		meta := behaviorMeta[bid]
		groups := groupsByBehavior[bid]

		var sum float64
		var n int
		reportGroups := make([]reportGroupDetail, 0, len(groups))
		for _, g := range groups {
			rg := reportGroupDetail{
				Relationship: g.Relationship,
				Label:        relationshipLabelForCycle(cycle.ID, g.Relationship),
				Avg:          round1Ptr(g.Avg),
				Min:          g.Min,
				Max:          g.Max,
				Submitted:    g.Submitted,
				Nominated:    g.Nominated,
				Importance:   round1Ptr(g.Importance),
			}
			reportGroups = append(reportGroups, rg)
			if g.Avg != nil {
				sum += *g.Avg
				n++
				if g.Relationship == "manager" || g.Relationship == "skip_level" {
					managerSumByComp[meta.CompetencyID] += *g.Avg
					managerNByComp[meta.CompetencyID]++
				}
			}
		}
		var overall *float64
		if n > 0 {
			v := round1(sum / float64(n))
			overall = &v
		}
		behaviorsByComp[meta.CompetencyID] = append(behaviorsByComp[meta.CompetencyID], reportBehaviorDetail{
			Statement: meta.Statement,
			Overall:   overall,
			Tag:       scoreTag(overall),
			Groups:    reportGroups,
		})
	}

	compDetails := make([]reportCompetencyDetail, 0, len(comps))
	for _, c := range comps {
		sr := scoreByComp[c.CompetencyID]
		selfScore := round1Ptr(sr.SelfScore)
		othersScore := round1Ptr(sr.OthersScore)
		var gap *float64
		if selfScore != nil && othersScore != nil {
			g := round1(*selfScore - *othersScore)
			gap = &g
		}
		var managerScore *float64
		if n := managerNByComp[c.CompetencyID.String()]; n > 0 {
			v := round1(managerSumByComp[c.CompetencyID.String()] / float64(n))
			managerScore = &v
		}
		compDetails = append(compDetails, reportCompetencyDetail{
			Title:        c.Title,
			SelfScore:    selfScore,
			OthersScore:  othersScore,
			ManagerScore: managerScore,
			Gap:          gap,
			Behaviors:    behaviorsByComp[c.CompetencyID.String()],
		})
	}

	// Reuse the same narrative logic the Results tab shows on screen, so the
	// PDF and the in-app summary never disagree.
	compScoreDTOs := make([]CompetencyScoreDTO, 0, len(compDetails))
	for _, c := range compDetails {
		compScoreDTOs = append(compScoreDTOs, CompetencyScoreDTO{
			Title: c.Title, SelfScore: c.SelfScore, OthersScore: c.OthersScore, Gap: c.Gap,
		})
	}

	// NOTE: an "Open Feedback" page (question prompts + representative
	// anonymized free-text answers) is a plausible future addition, but
	// feedback_open_responses isn't currently joined/aggregated anywhere
	// scoped to a single participant's panel — listCycleOpenQuestions only
	// returns prompts, not answers. Left out rather than half-built; would
	// need a new repository query.

	return &ReportData{
		ParticipantName: participantFullNameFor(participantID),
		OrgName:         orgNameFor(cycle.OrgID),
		CycleName:       derefStr(cycle.Name, cycle.Title),
		GeneratedOn:     time.Now(),
		Competencies:    compDetails,
		Narrative:       composeNarrative(compScoreDTOs),
	}, nil
}

// ── PDF rendering ─────────────────────────────────────────────────

var (
	navyColor   = &props.Color{Red: 0x1C, Green: 0x25, Blue: 0x51}
	orangeColor = &props.Color{Red: 0xEF, Green: 0x4E, Blue: 0x24}
	mutedColor  = &props.Color{Red: 0x8B, Green: 0x90, Blue: 0xA7}
	greenColor  = &props.Color{Red: 0x22, Green: 0xC5, Blue: 0x5E}
	amberColor  = &props.Color{Red: 0xF5, Green: 0x9E, Blue: 0x0B}
	pageBgColor = &props.Color{Red: 0xF5, Green: 0xF7, Blue: 0xFB}
	altRowColor = &props.Color{Red: 0xF9, Green: 0xFA, Blue: 0xFB}
	whiteColor  = &props.Color{Red: 255, Green: 255, Blue: 255}
	// navyTintColor is a light navy card background for the hidden-strengths /
	// blind-spots page, distinguishing "card" sections from the zebra-striped
	// table rows used elsewhere.
	navyTintColor = &props.Color{Red: 0xEA, Green: 0xED, Blue: 0xF7}
)

func tagColor(tag string) *props.Color {
	switch tag {
	case "Strength":
		return greenColor
	case "Growth area":
		return orangeColor
	default:
		return amberColor
	}
}

func scoreText(v *float64) string {
	if v == nil {
		return "—"
	}
	return fmt.Sprintf("%.1f/5", *v)
}

// generateParticipantReportPDF renders the ~8-12 page report: cover, intro,
// alignment overview, hidden strengths & blind spots, one or more detailed-
// results pages, and a closing narrative page.
func generateParticipantReportPDF(data *ReportData) ([]byte, error) {
	cfg := config.NewBuilder().
		WithPageNumber().
		WithLeftMargin(15).
		WithTopMargin(15).
		WithRightMargin(15).
		Build()
	m := maroto.New(cfg)

	m.AddPages(
		coverPage(data),
		introPage(data),
		overviewPage(data),
		hiddenStrengthsPage(data),
	)
	for _, p := range detailPages(data) {
		m.AddPages(p)
	}
	m.AddPages(narrativePage(data))

	document, err := m.Generate()
	if err != nil {
		return nil, err
	}
	return document.GetBytes(), nil
}

func brandHeaderRow() core.Row {
	return row.New(10).Add(
		text.NewCol(8, "360° Feedback Report", props.Text{Size: 9, Color: mutedColor}),
		text.NewCol(4, "Intellique", props.Text{Size: 9, Align: align.Right, Style: fontstyle.Bold, Color: navyColor}),
	)
}

func sectionTitleRow(title string) core.Row {
	return row.New(10).Add(col.New(12).Add(
		text.New(title, props.Text{Size: 16, Style: fontstyle.Bold, Color: navyColor}),
	))
}

func sectionSubtitleRow(s string) core.Row {
	return row.New(10).Add(col.New(12).Add(
		text.New(s, props.Text{Size: 9, Color: mutedColor}),
	))
}

func centeredTextRow(height float64, s string, p props.Text) core.Row {
	p.Align = align.Center
	return row.New(height).Add(col.New(12).Add(text.New(s, p)))
}

func coverPage(data *ReportData) core.Page {
	return page.New().Add(
		row.New(60),
		centeredTextRow(14, "360° Feedback Report", props.Text{Size: 26, Style: fontstyle.Bold, Color: navyColor}),
		centeredTextRow(10, "Powered by Executive Acceleration Learning", props.Text{Size: 10, Color: mutedColor}),
		row.New(40),
		centeredTextRow(10, data.ParticipantName, props.Text{Size: 16, Style: fontstyle.Bold, Color: orangeColor}),
		centeredTextRow(8, data.OrgName, props.Text{Size: 11, Color: mutedColor}),
		centeredTextRow(8, data.CycleName, props.Text{Size: 11, Color: mutedColor}),
		centeredTextRow(8, "Generated "+data.GeneratedOn.Format("2 January 2006"), props.Text{Size: 9, Color: mutedColor}),
	)
}

// introPage explains what a 360 is, who provided feedback, what "All Raters"
// means, the competencies rated this cycle, the 1-5 rating scale, and the
// scoring thresholds used throughout the rest of the report — so the reader
// understands the tags (Strength / Proficient / Growth area) before they hit
// them on later pages.
func introPage(data *ReportData) core.Page {
	rows := []core.Row{
		brandHeaderRow(),
		row.New(4),
		sectionTitleRow("About This Report"),
		row.New(6).Add(col.New(12).Add(
			text.New("A 360° feedback report brings together how you rate yourself and how the people around you — your manager, "+
				"your direct reports, your peers, and others you work with — rate you on the same set of behaviors. Comparing the "+
				"two views highlights where your self-perception lines up with how you come across to others, and where it doesn't.",
				props.Text{Size: 9.5, Color: navyColor}),
		)),
		row.New(10),
		row.New(8).Add(col.New(12).Add(
			text.New("Who Provided Feedback", props.Text{Size: 12, Style: fontstyle.Bold, Color: navyColor}),
		)),
	}

	raterGroups := []struct{ label, desc string }{
		{"You", "Your own self-rating on every behavior."},
		{"Your Manager / Skip Manager", "Your direct manager and, where nominated, their manager."},
		{"Your Direct Reports", "People who report to you."},
		{"Your Peers", "Colleagues at a similar level who work with you regularly."},
		{"All Raters", "Everyone who rated you EXCEPT yourself — the comparison point used throughout this report."},
	}
	for i, g := range raterGroups {
		bg := whiteColor
		if i%2 == 1 {
			bg = altRowColor
		}
		rows = append(rows, row.New(8).Add(
			text.NewCol(4, g.label, props.Text{Size: 9, Style: fontstyle.Bold, Color: orangeColor, Top: 2}),
			text.NewCol(8, g.desc, props.Text{Size: 9, Color: navyColor, Top: 2}),
		).WithStyle(&props.Cell{BackgroundColor: bg}))
	}

	rows = append(rows,
		row.New(10),
		row.New(8).Add(col.New(12).Add(
			text.New("Competencies Rated This Cycle", props.Text{Size: 12, Style: fontstyle.Bold, Color: navyColor}),
		)),
	)
	if len(data.Competencies) == 0 {
		rows = append(rows, row.New(7).Add(col.New(12).Add(
			text.New("No competencies configured for this cycle.", props.Text{Size: 9, Color: mutedColor}),
		)))
	} else {
		for i, c := range data.Competencies {
			bg := whiteColor
			if i%2 == 1 {
				bg = altRowColor
			}
			rows = append(rows, row.New(7).Add(
				text.NewCol(2, competencyCode(c.Title, i), props.Text{Size: 9, Style: fontstyle.Bold, Align: align.Center, Color: orangeColor, Top: 1}),
				text.NewCol(10, c.Title, props.Text{Size: 9, Color: navyColor, Top: 1}),
			).WithStyle(&props.Cell{BackgroundColor: bg}))
		}
	}

	rows = append(rows,
		row.New(10),
		row.New(8).Add(col.New(12).Add(
			text.New("The Rating Scale", props.Text{Size: 12, Style: fontstyle.Bold, Color: navyColor}),
		)),
		row.New(7).Add(col.New(12).Add(
			text.New("Every behavior was rated on a 1-5 scale: 1 = Not well at all, through to 5 = Extremely well. Raters could also "+
				"select \"Unable to rate / Not observed\", which is excluded from averages rather than counted as a low score.",
				props.Text{Size: 9, Color: navyColor}),
		)),
		row.New(8),
		row.New(8).Add(col.New(12).Add(
			text.New("How to Read the Tags", props.Text{Size: 12, Style: fontstyle.Bold, Color: navyColor}),
		)),
		row.New(7).Add(
			text.NewCol(4, "Strength", props.Text{Size: 9, Style: fontstyle.Bold, Color: greenColor}),
			text.NewCol(8, "Average score of 4.0 or higher.", props.Text{Size: 9, Color: navyColor}),
		),
		row.New(7).Add(
			text.NewCol(4, "Proficient", props.Text{Size: 9, Style: fontstyle.Bold, Color: amberColor}),
			text.NewCol(8, "Average score between 3.0 and 3.99.", props.Text{Size: 9, Color: navyColor}),
		),
		row.New(7).Add(
			text.NewCol(4, "Growth area", props.Text{Size: 9, Style: fontstyle.Bold, Color: orangeColor}),
			text.NewCol(8, "Average score below 3.0 — the best place to focus development.", props.Text{Size: 9, Color: navyColor}),
		),
		row.New(12),
		row.New(14).Add(col.New(12).Add(
			text.New("This report is confidential. It is intended solely for your own development and should be shared only at your discretion "+
				"— for example with your manager or a coach, to support a well-rounded development conversation.",
				props.Text{Size: 8, Style: fontstyle.Italic, Color: mutedColor}),
		)),
	)

	return page.New().Add(rows...)
}

// competencyCode derives a short 2-3 letter code from a competency title for
// the intro page's quick-reference list (purely a display abbreviation — no
// hardcoded framework, works for whatever competencies this org configured).
func competencyCode(title string, fallbackIdx int) string {
	code := ""
	takeNext := true
	for _, r := range title {
		if r == ' ' || r == '-' || r == '_' {
			takeNext = true
			continue
		}
		if takeNext {
			code += string(r)
			takeNext = false
			if len(code) >= 3 {
				break
			}
		}
	}
	if code == "" {
		return fmt.Sprintf("C%d", fallbackIdx+1)
	}
	return code
}

// barTuple is one labeled, colored bar segment for a multi-bar comparison row
// (e.g. You / All Raters / Manager per competency).
type barTuple struct {
	Label string
	Value *float64
	Color *props.Color
}

func overviewPage(data *ReportData) core.Page {
	showManager := false
	for _, c := range data.Competencies {
		if c.ManagerScore != nil {
			showManager = true
			break
		}
	}

	legend := "You vs. All Raters (everyone who rated you except yourself)."
	if showManager {
		legend = "You vs. All Raters vs. your Manager, per competency."
	}

	rows := []core.Row{
		brandHeaderRow(),
		row.New(4),
		sectionTitleRow("Alignment Overview"),
		sectionSubtitleRow(legend + " Scores of 4.0+ are strengths, 3.0-3.99 is proficient, below 3.0 is a growth area."),
		row.New(6),
	}

	headerCols := []core.Col{
		text.NewCol(4, "Competency", props.Text{Size: 9, Style: fontstyle.Bold, Color: navyColor}),
		text.NewCol(2, "You", props.Text{Size: 9, Style: fontstyle.Bold, Align: align.Center, Color: orangeColor}),
		text.NewCol(2, "All Raters", props.Text{Size: 9, Style: fontstyle.Bold, Align: align.Center, Color: navyColor}),
	}
	if showManager {
		headerCols = append(headerCols, text.NewCol(2, "Manager", props.Text{Size: 9, Style: fontstyle.Bold, Align: align.Center, Color: mutedColor}))
		headerCols = append(headerCols, text.NewCol(2, "", props.Text{Size: 9}))
	} else {
		headerCols = append(headerCols, text.NewCol(4, "", props.Text{Size: 9}))
	}
	rows = append(rows, row.New(8).Add(headerCols...).WithStyle(&props.Cell{BackgroundColor: pageBgColor}))

	for i, c := range data.Competencies {
		bg := whiteColor
		if i%2 == 1 {
			bg = altRowColor
		}
		valCols := []core.Col{
			text.NewCol(4, c.Title, props.Text{Size: 9, Color: navyColor, Top: 2}),
			text.NewCol(2, scoreText(c.SelfScore), props.Text{Size: 9, Align: align.Center, Color: orangeColor, Top: 2}),
			text.NewCol(2, scoreText(c.OthersScore), props.Text{Size: 9, Align: align.Center, Color: navyColor, Top: 2}),
		}
		if showManager {
			valCols = append(valCols, text.NewCol(2, scoreText(c.ManagerScore), props.Text{Size: 9, Align: align.Center, Color: mutedColor, Top: 2}))
			valCols = append(valCols, text.NewCol(2, "", props.Text{Size: 9}))
		} else {
			valCols = append(valCols, text.NewCol(4, "", props.Text{Size: 9}))
		}
		rows = append(rows, row.New(9).Add(valCols...).WithStyle(&props.Cell{BackgroundColor: bg}))

		bars := []barTuple{
			{Label: "You", Value: c.SelfScore, Color: orangeColor},
			{Label: "All Raters", Value: c.OthersScore, Color: navyColor},
		}
		if showManager {
			bars = append(bars, barTuple{Label: "Manager", Value: c.ManagerScore, Color: mutedColor})
		}
		rows = append(rows, multiBarRow(bars)...)
		rows = append(rows, row.New(2))
	}
	return page.New().Add(rows...)
}

// multiBarRow draws one thin horizontal fill bar per tuple (stacked as
// consecutive short rows), each scaled to its 0-5 score out of a 12-wide
// track — a grouped-bar-chart substitute standing in for a radar/polygon
// chart, which maroto has no native coordinate-based primitive for. This
// generalizes the single-bar version to any number of (label, value, color)
// comparisons per competency (You / All Raters / Manager).
func multiBarRow(bars []barTuple) []core.Row {
	rows := make([]core.Row, 0, len(bars))
	for _, b := range bars {
		filled := 0
		if b.Value != nil {
			filled = int((*b.Value / 5.0) * 10)
			if filled > 10 {
				filled = 10
			}
		}
		r := row.New(3)
		cols := []core.Col{
			text.NewCol(2, b.Label, props.Text{Size: 6.5, Color: mutedColor}),
		}
		if filled > 0 {
			cols = append(cols, col.New(filled).WithStyle(&props.Cell{BackgroundColor: b.Color}))
		}
		if filled < 10 {
			cols = append(cols, col.New(10-filled))
		}
		rows = append(rows, r.Add(cols...))
	}
	return rows
}

// hiddenStrengthsPage is a new section (not in the earlier condensed report):
// competencies where self-perception and how others see you diverge
// meaningfully, split into hidden strengths (self underestimates) and blind
// spots (self overestimates). Handles the zero-in-either-bucket case
// gracefully rather than leaving a blank page.
func hiddenStrengthsPage(data *ReportData) core.Page {
	var hidden, blind []reportCompetencyDetail
	for _, c := range data.Competencies {
		if c.Gap == nil {
			continue
		}
		switch {
		case *c.Gap <= hiddenStrengthGapThreshold:
			hidden = append(hidden, c)
		case *c.Gap >= blindSpotGapThreshold:
			blind = append(blind, c)
		}
	}
	sort.Slice(hidden, func(i, j int) bool { return *hidden[i].Gap < *hidden[j].Gap })
	sort.Slice(blind, func(i, j int) bool { return *blind[i].Gap > *blind[j].Gap })

	rows := []core.Row{
		brandHeaderRow(),
		row.New(4),
		sectionTitleRow("Hidden Strengths & Blind Spots"),
		sectionSubtitleRow("Competencies where your self-rating and how All Raters see you diverge by half a point or more."),
		row.New(6),
	}

	rows = append(rows, cardHeaderRow("Hidden Strengths", greenColor,
		"Areas you may be underestimating in yourself — others rate you meaningfully higher than you rate yourself.")...)
	rows = append(rows, gapCardRows(hidden)...)

	rows = append(rows, row.New(8))

	rows = append(rows, cardHeaderRow("Blind Spots", orangeColor,
		"Areas where you may not be applying yourself as well as you think — you rate yourself meaningfully higher than others do.")...)
	rows = append(rows, gapCardRows(blind)...)

	return page.New().Add(rows...)
}

// cardHeaderRow renders a "card" section heading with a tinted background,
// consistent with the zebra-striped-row card look used elsewhere in this file.
func cardHeaderRow(title string, accent *props.Color, desc string) []core.Row {
	return []core.Row{
		row.New(9).Add(col.New(12).Add(
			text.New(title, props.Text{Size: 12, Style: fontstyle.Bold, Color: accent, Left: 3, Top: 2}),
		)).WithStyle(&props.Cell{BackgroundColor: navyTintColor}),
		row.New(7).Add(col.New(12).Add(
			text.New(desc, props.Text{Size: 8.5, Color: mutedColor, Left: 3}),
		)),
	}
}

func gapCardRows(comps []reportCompetencyDetail) []core.Row {
	if len(comps) == 0 {
		return []core.Row{
			row.New(8).Add(col.New(12).Add(
				text.New("None identified this cycle.", props.Text{Size: 9, Style: fontstyle.Italic, Color: mutedColor, Left: 3}),
			)),
		}
	}
	rows := make([]core.Row, 0, len(comps))
	for i, c := range comps {
		bg := whiteColor
		if i%2 == 1 {
			bg = altRowColor
		}
		gapLabel := fmt.Sprintf("You %s · All Raters %s", scoreText(c.SelfScore), scoreText(c.OthersScore))
		rows = append(rows, row.New(9).Add(
			text.NewCol(6, c.Title, props.Text{Size: 9.5, Color: navyColor, Left: 3, Top: 2}),
			text.NewCol(6, gapLabel, props.Text{Size: 8.5, Align: align.Right, Color: mutedColor, Top: 2}),
		).WithStyle(&props.Cell{BackgroundColor: bg}))
	}
	return rows
}

// detailPages lays out every competency's behavior breakdown, paginating so
// roughly 2 competencies land per page.
func detailPages(data *ReportData) []core.Page {
	const perPage = 2
	var pages []core.Page
	for i := 0; i < len(data.Competencies); i += perPage {
		end := i + perPage
		if end > len(data.Competencies) {
			end = len(data.Competencies)
		}
		rows := []core.Row{
			brandHeaderRow(),
			row.New(4),
			sectionTitleRow("Detailed Results"),
		}
		for _, c := range data.Competencies[i:end] {
			rows = append(rows, competencySection(c)...)
		}
		pages = append(pages, page.New().Add(rows...))
	}
	if len(pages) == 0 {
		pages = append(pages, page.New().Add(
			brandHeaderRow(),
			row.New(10).Add(col.New(12).Add(text.New("No competency results yet.", props.Text{Size: 10, Color: mutedColor}))),
		))
	}
	return pages
}

func competencySection(c reportCompetencyDetail) []core.Row {
	rows := []core.Row{
		row.New(8),
		row.New(9).Add(
			text.NewCol(8, c.Title, props.Text{Size: 12, Style: fontstyle.Bold, Color: navyColor}),
			text.NewCol(4, "Self "+scoreText(c.SelfScore)+"  ·  Others "+scoreText(c.OthersScore),
				props.Text{Size: 9, Align: align.Right, Color: mutedColor, Top: 1}),
		),
	}
	if len(c.Behaviors) == 0 {
		rows = append(rows, row.New(7).Add(col.New(12).Add(
			text.New("No behavior responses yet for this competency.", props.Text{Size: 9, Color: mutedColor}),
		)))
		return rows
	}
	for _, b := range c.Behaviors {
		rows = append(rows, row.New(7).Add(
			text.NewCol(8, b.Statement, props.Text{Size: 9, Color: navyColor}),
			text.NewCol(2, scoreText(b.Overall), props.Text{Size: 9, Align: align.Center, Style: fontstyle.Bold, Color: navyColor}),
			text.NewCol(2, b.Tag, props.Text{Size: 8, Align: align.Right, Style: fontstyle.Bold, Color: tagColor(b.Tag)}),
		))
		for _, g := range b.Groups {
			missing := 0
			if g.Nominated > 0 {
				missing = int((float64(g.Nominated-g.Submitted) / float64(g.Nominated)) * 100)
			}
			line := fmt.Sprintf("%s: avg %s", g.Label, scoreText(g.Avg))
			if g.Min != nil && g.Max != nil {
				line += fmt.Sprintf("  (range %.0f-%.0f)", *g.Min, *g.Max)
			}
			line += fmt.Sprintf("  · %d received", g.Submitted)
			if missing > 0 {
				line += fmt.Sprintf("  · %d%% missing", missing)
			}
			if g.Importance != nil && (g.Relationship == "manager" || g.Relationship == "skip_level") {
				line += fmt.Sprintf("  · Importance %.1f/5", *g.Importance)
			}
			rows = append(rows, row.New(5).Add(col.New(12).Add(
				text.New(line, props.Text{Size: 7.5, Color: mutedColor, Left: 4}),
			)))
		}
	}
	return rows
}

func narrativePage(data *ReportData) core.Page {
	narrative := data.Narrative
	if narrative == "" {
		narrative = "Your developmental narrative will appear once enough raters have submitted feedback."
	}
	return page.New().Add(
		brandHeaderRow(),
		row.New(4),
		sectionTitleRow("Summary"),
		sectionSubtitleRow("Strengths, blind spots, and the biggest development opportunity from this cycle."),
		row.New(10),
		row.New(40).Add(col.New(12).Add(
			text.New(narrative, props.Text{Size: 10.5, Color: navyColor}),
		)),
		row.New(10),
		row.New(8).Add(col.New(12).Add(
			text.New("Building Your Action Plan", props.Text{Size: 12, Style: fontstyle.Bold, Color: navyColor}),
		)),
		row.New(18).Add(col.New(12).Add(
			text.New("Pick one or two of the growth areas above and turn them into a simple development plan: what you'll practice on the "+
				"job, who can give you feedback along the way, and what you'll read, watch, or learn from. Small, consistent changes in how "+
				"you show up day-to-day tend to move the needle more than any single training session — revisit this report in your next cycle "+
				"to see how far you've come.",
				props.Text{Size: 9, Color: navyColor}),
		)),
		row.New(14),
		row.New(20).Add(col.New(12).Add(
			text.New("This report is confidential and generated for your individual development. Review it with your manager or coach for a well-rounded discussion.",
				props.Text{Size: 8, Color: mutedColor}),
		)),
	)
}
