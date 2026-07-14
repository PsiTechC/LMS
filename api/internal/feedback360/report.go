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

// Condensed 4-5 page 360° report, styled after the org's full-length reference
// report (cover → overview → detailed results → narrative) but scoped down to
// what one PDF page each section reasonably holds. A future iteration can grow
// this toward the full multi-page reference format without changing callers.

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
}

// reportCompetencyDetail is one competency's report section: its own
// self-vs-others score plus every behavior underneath it.
type reportCompetencyDetail struct {
	Title      string
	SelfScore  *float64
	OthersScore *float64
	Behaviors  []reportBehaviorDetail
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

// buildParticipantReportData assembles the report content for one
// participant's panel on a cycle, using the same aggregation queries the
// Results tab and narrative already rely on (aggregateScores, composeNarrative)
// plus the new per-behavior breakdown query.
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
			}
			reportGroups = append(reportGroups, rg)
			if g.Avg != nil {
				sum += *g.Avg
				n++
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
		compDetails = append(compDetails, reportCompetencyDetail{
			Title:       c.Title,
			SelfScore:   round1Ptr(sr.SelfScore),
			OthersScore: round1Ptr(sr.OthersScore),
			Behaviors:   behaviorsByComp[c.CompetencyID.String()],
		})
	}

	// Reuse the same narrative logic the Results tab shows on screen, so the
	// PDF and the in-app summary never disagree.
	compScoreDTOs := make([]CompetencyScoreDTO, 0, len(compDetails))
	for _, c := range compDetails {
		var gap *float64
		if c.SelfScore != nil && c.OthersScore != nil {
			g := round1(*c.SelfScore - *c.OthersScore)
			gap = &g
		}
		compScoreDTOs = append(compScoreDTOs, CompetencyScoreDTO{
			Title: c.Title, SelfScore: c.SelfScore, OthersScore: c.OthersScore, Gap: gap,
		})
	}

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

// generateParticipantReportPDF renders the 4-5 page report: cover, overview,
// one or two detailed-results pages, and a closing narrative page.
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
		overviewPage(data),
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
		text.NewCol(4, "XA LMS", props.Text{Size: 9, Align: align.Right, Style: fontstyle.Bold, Color: navyColor}),
	)
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

func overviewPage(data *ReportData) core.Page {
	rows := []core.Row{
		brandHeaderRow(),
		row.New(4),
		row.New(10).Add(col.New(12).Add(
			text.New("Overview", props.Text{Size: 16, Style: fontstyle.Bold, Color: navyColor}),
		)),
		row.New(10).Add(col.New(12).Add(
			text.New("Self vs. others average score per competency. Scores of 4.0+ are strengths, 3.0-3.99 is proficient, below 3.0 is a development area.",
				props.Text{Size: 9, Color: mutedColor}),
		)),
		row.New(6),
		row.New(8).Add(
			text.NewCol(5, "Competency", props.Text{Size: 9, Style: fontstyle.Bold, Color: navyColor}),
			text.NewCol(2, "Self", props.Text{Size: 9, Style: fontstyle.Bold, Align: align.Center, Color: orangeColor}),
			text.NewCol(2, "Others", props.Text{Size: 9, Style: fontstyle.Bold, Align: align.Center, Color: navyColor}),
			text.NewCol(3, "Others /5", props.Text{Size: 9, Style: fontstyle.Bold, Align: align.Center, Color: mutedColor}),
		).WithStyle(&props.Cell{BackgroundColor: pageBgColor}),
	}

	for i, c := range data.Competencies {
		bg := whiteColor
		if i%2 == 1 {
			bg = altRowColor
		}
		rows = append(rows, row.New(9).Add(
			text.NewCol(5, c.Title, props.Text{Size: 9, Color: navyColor, Top: 2}),
			text.NewCol(2, scoreText(c.SelfScore), props.Text{Size: 9, Align: align.Center, Color: orangeColor, Top: 2}),
			text.NewCol(2, scoreText(c.OthersScore), props.Text{Size: 9, Align: align.Center, Color: navyColor, Top: 2}),
		).WithStyle(&props.Cell{BackgroundColor: bg}))
		rows = append(rows, barRow(c.OthersScore))
	}
	return page.New().Add(rows...)
}

// barRow draws a simple horizontal fill bar (a colored col scaled to the 0-5
// score, out of a 12-wide track) as its own thin row under each competency —
// standing in for a radar/polygon chart, which maroto has no native
// coordinate-based primitive for. Reads just as clearly at this scale.
func barRow(v *float64) core.Row {
	filled := 0
	if v != nil {
		filled = int((*v / 5.0) * 12)
		if filled > 12 {
			filled = 12
		}
	}
	r := row.New(3)
	if filled <= 0 {
		return r
	}
	cols := []core.Col{col.New(filled).WithStyle(&props.Cell{BackgroundColor: orangeColor})}
	if filled < 12 {
		cols = append(cols, col.New(12-filled))
	}
	return r.Add(cols...)
}

// detailPages lays out every competency's behavior breakdown, paginating so
// roughly 2 competencies land per page — keeping the whole report to the
// requested 4-5 pages rather than the reference doc's 30+.
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
			row.New(10).Add(col.New(12).Add(
				text.New("Detailed Results", props.Text{Size: 16, Style: fontstyle.Bold, Color: navyColor}),
			)),
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
		row.New(10).Add(col.New(12).Add(
			text.New("Summary", props.Text{Size: 16, Style: fontstyle.Bold, Color: navyColor}),
		)),
		row.New(10).Add(col.New(12).Add(
			text.New("Strengths, blind spots, and the biggest development opportunity from this cycle.", props.Text{Size: 9, Color: mutedColor}),
		)),
		row.New(10),
		row.New(40).Add(col.New(12).Add(
			text.New(narrative, props.Text{Size: 10.5, Color: navyColor}),
		)),
		row.New(20),
		row.New(20).Add(col.New(12).Add(
			text.New("This report is confidential and generated for your individual development. Review it with your manager or coach for a well-rounded discussion.",
				props.Text{Size: 8, Color: mutedColor}),
		)),
	)
}
