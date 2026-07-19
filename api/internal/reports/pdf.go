package reports

import (
	"fmt"

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

// PDF rendering for the platform-wide Super Admin export. Styled to match
// feedback360/report.go's brand look (navy/gold, zebra-striped tables, a
// stacked-thin-row bar chart substitute — maroto has no coordinate-based
// chart primitive) so every generated report in this codebase looks like it
// came from the same system.

var (
	navyColor   = &props.Color{Red: 0x18, Green: 0x28, Blue: 0x48} // brand.navy #182848
	goldColor   = &props.Color{Red: 0xC8, Green: 0xA8, Blue: 0x60} // brand.gold #C8A860
	slateColor  = &props.Color{Red: 0x4A, Green: 0x55, Blue: 0x73} // brand.slate #4A5573
	mutedColor  = &props.Color{Red: 0x64, Green: 0x74, Blue: 0x8b}
	greenColor  = &props.Color{Red: 0x22, Green: 0xc5, Blue: 0x5e} // status.success
	amberColor  = &props.Color{Red: 0xf5, Green: 0x9e, Blue: 0x0b} // status.warning
	dangerColor = &props.Color{Red: 0xef, Green: 0x44, Blue: 0x44} // status.danger
	whiteColor  = &props.Color{Red: 255, Green: 255, Blue: 255}
	altRowColor = &props.Color{Red: 0xEF, Green: 0xE9, Blue: 0xDC} // surface.alt
	pageBgColor = &props.Color{Red: 0xF7, Green: 0xF5, Blue: 0xF0} // surface.page

	// Fixed palette for chart bars, cycling if there are more buckets than colors.
	chartPalette = []*props.Color{navyColor, goldColor, slateColor, greenColor, amberColor, dangerColor}
)

func chartColor(i int) *props.Color {
	return chartPalette[i%len(chartPalette)]
}

func statusColor(status string) *props.Color {
	switch status {
	case "active":
		return greenColor
	case "trial", "onboarding":
		return goldColor
	case "suspended":
		return dangerColor
	default:
		return mutedColor
	}
}

// renderPlatformReportPDF renders the full platform report: cover, summary,
// organizations table, charts (orgs by plan, orgs by status, users by role,
// enrollment trend).
func renderPlatformReportPDF(data *PlatformReportData) ([]byte, error) {
	cfg := config.NewBuilder().
		WithPageNumber().
		WithLeftMargin(15).
		WithTopMargin(15).
		WithRightMargin(15).
		Build()
	m := maroto.New(cfg)

	m.AddPages(coverPage(data))
	m.AddPages(summaryPage(data))
	for _, p := range organizationsPages(data) {
		m.AddPages(p)
	}
	m.AddPages(chartsPage(data))

	document, err := m.Generate()
	if err != nil {
		return nil, err
	}
	return document.GetBytes(), nil
}

func brandHeaderRow() core.Row {
	return row.New(10).Add(
		text.NewCol(8, "Platform Report — Super Admin", props.Text{Size: 9, Color: mutedColor}),
		text.NewCol(4, "XA-LMS", props.Text{Size: 9, Align: align.Right, Style: fontstyle.Bold, Color: navyColor}),
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

func coverPage(data *PlatformReportData) core.Page {
	return page.New().Add(
		row.New(60),
		centeredTextRow(14, "Platform Report", props.Text{Size: 26, Style: fontstyle.Bold, Color: navyColor}),
		centeredTextRow(10, "Cross-Organization Overview — Executive Acceleration Learning", props.Text{Size: 10, Color: mutedColor}),
		row.New(40),
		centeredTextRow(10, fmt.Sprintf("%d Organizations · %d Users · %d Programs", data.TotalOrgs, data.TotalUsers, data.TotalPrograms),
			props.Text{Size: 13, Style: fontstyle.Bold, Color: goldColor}),
		centeredTextRow(8, "Generated "+data.GeneratedOn, props.Text{Size: 9, Color: mutedColor}),
	)
}

// summaryPage shows the same headline stat-card numbers the Organizations
// tab shows on screen (Total Organizations, Total Seats, Active Organizations,
// plus platform-wide program/enrollment rollups not shown on that page).
func summaryPage(data *PlatformReportData) core.Page {
	cards := []struct {
		label string
		value string
		color *props.Color
	}{
		{"Total Organizations", fmt.Sprintf("%d", data.TotalOrgs), navyColor},
		{"Active Organizations", fmt.Sprintf("%d", data.ActiveOrgs), greenColor},
		{"Total Seats", fmt.Sprintf("%d", data.TotalSeats), goldColor},
		{"Total Users", fmt.Sprintf("%d", data.TotalUsers), slateColor},
		{"Total Programs", fmt.Sprintf("%d", data.TotalPrograms), navyColor},
		{"Published Programs", fmt.Sprintf("%d", data.PublishedPrograms), goldColor},
		{"Total Cohorts", fmt.Sprintf("%d", data.TotalCohorts), slateColor},
		{"Total Enrollments", fmt.Sprintf("%d", data.TotalEnrollments), navyColor},
	}

	rows := []core.Row{
		brandHeaderRow(),
		row.New(4),
		sectionTitleRow("Platform Summary"),
		sectionSubtitleRow("Headline counts across every organization on the platform, as of the generation time above."),
		row.New(6),
	}

	// 2 cards per row, 4 rows — each "card" is a label text row followed by a
	// value text row (col.Add only accepts leaf components like text, not
	// nested rows, so the card can't be built as a single col containing two
	// stacked rows).
	for i := 0; i < len(cards); i += 2 {
		c1 := cards[i]
		var c2 *struct {
			label, value string
			color        *props.Color
		}
		if i+1 < len(cards) {
			c2 = &struct {
				label, value string
				color        *props.Color
			}{cards[i+1].label, cards[i+1].value, cards[i+1].color}
		}

		labelCols := []core.Col{
			text.NewCol(6, c1.label, props.Text{Size: 8, Style: fontstyle.Bold, Color: mutedColor}),
		}
		valueCols := []core.Col{
			text.NewCol(6, c1.value, props.Text{Size: 16, Style: fontstyle.Bold, Color: c1.color}),
		}
		if c2 != nil {
			labelCols = append(labelCols, text.NewCol(6, c2.label, props.Text{Size: 8, Style: fontstyle.Bold, Color: mutedColor}))
			valueCols = append(valueCols, text.NewCol(6, c2.value, props.Text{Size: 16, Style: fontstyle.Bold, Color: c2.color}))
		} else {
			labelCols = append(labelCols, text.NewCol(6, "", props.Text{Size: 8}))
			valueCols = append(valueCols, text.NewCol(6, "", props.Text{Size: 16}))
		}

		rows = append(rows,
			row.New(8).Add(labelCols...).WithStyle(&props.Cell{BackgroundColor: pageBgColor}),
			row.New(10).Add(valueCols...).WithStyle(&props.Cell{BackgroundColor: pageBgColor}),
			row.New(3),
		)
	}

	rows = append(rows,
		row.New(10),
		row.New(8).Add(col.New(12).Add(
			text.New(fmt.Sprintf("Average Enrollment Completion: %.1f%%", data.AvgCompletionPct),
				props.Text{Size: 11, Style: fontstyle.Bold, Color: navyColor}),
		)),
	)

	return page.New().Add(rows...)
}

// organizationsPages paginates the organizations table, roughly 18 rows per page.
func organizationsPages(data *PlatformReportData) []core.Page {
	const perPage = 18
	if len(data.Organizations) == 0 {
		return []core.Page{page.New().Add(
			brandHeaderRow(),
			row.New(4),
			sectionTitleRow("Organizations"),
			row.New(10).Add(col.New(12).Add(text.New("No organizations on the platform yet.", props.Text{Size: 10, Color: mutedColor}))),
		)}
	}

	var pages []core.Page
	for start := 0; start < len(data.Organizations); start += perPage {
		end := start + perPage
		if end > len(data.Organizations) {
			end = len(data.Organizations)
		}
		rows := []core.Row{
			brandHeaderRow(),
			row.New(4),
			sectionTitleRow("Organizations"),
			sectionSubtitleRow("Every organization on the platform: plan, seats, members, programs, and enrollment completion."),
			row.New(6),
			row.New(8).Add(
				text.NewCol(3, "Organization", props.Text{Size: 8.5, Style: fontstyle.Bold, Color: navyColor}),
				text.NewCol(2, "Plan", props.Text{Size: 8.5, Style: fontstyle.Bold, Color: navyColor}),
				text.NewCol(2, "Status", props.Text{Size: 8.5, Style: fontstyle.Bold, Color: navyColor}),
				text.NewCol(1, "Seats", props.Text{Size: 8.5, Style: fontstyle.Bold, Align: align.Center, Color: navyColor}),
				text.NewCol(1, "Users", props.Text{Size: 8.5, Style: fontstyle.Bold, Align: align.Center, Color: navyColor}),
				text.NewCol(1, "Progs", props.Text{Size: 8.5, Style: fontstyle.Bold, Align: align.Center, Color: navyColor}),
				text.NewCol(2, "Avg Completion", props.Text{Size: 8.5, Style: fontstyle.Bold, Align: align.Center, Color: navyColor}),
			).WithStyle(&props.Cell{BackgroundColor: pageBgColor}),
		}
		for i, o := range data.Organizations[start:end] {
			bg := whiteColor
			if i%2 == 1 {
				bg = altRowColor
			}
			rows = append(rows, row.New(8).Add(
				text.NewCol(3, o.Name, props.Text{Size: 8.5, Color: navyColor, Top: 1}),
				text.NewCol(2, o.Plan, props.Text{Size: 8.5, Color: slateColor, Top: 1}),
				text.NewCol(2, o.Status, props.Text{Size: 8.5, Style: fontstyle.Bold, Color: statusColor(o.Status), Top: 1}),
				text.NewCol(1, fmt.Sprintf("%d", o.Seats), props.Text{Size: 8.5, Align: align.Center, Color: navyColor, Top: 1}),
				text.NewCol(1, fmt.Sprintf("%d", o.MemberCount), props.Text{Size: 8.5, Align: align.Center, Color: navyColor, Top: 1}),
				text.NewCol(1, fmt.Sprintf("%d", o.ProgramCount), props.Text{Size: 8.5, Align: align.Center, Color: navyColor, Top: 1}),
				text.NewCol(2, fmt.Sprintf("%.0f%%", o.AvgCompletionPct), props.Text{Size: 8.5, Align: align.Center, Color: navyColor, Top: 1}),
			).WithStyle(&props.Cell{BackgroundColor: bg}))
		}
		pages = append(pages, page.New().Add(rows...))
	}
	return pages
}

// chartsPage renders 4 simple bar charts (orgs by plan, orgs by status, users
// by role, enrollment trend) as labeled horizontal bars — maroto has no
// coordinate-based chart primitive, so bars are built the same way
// feedback360/report.go's multiBarRow does: a scaled fill column inside a
// fixed-width track.
func chartsPage(data *PlatformReportData) core.Page {
	rows := []core.Row{
		brandHeaderRow(),
		row.New(4),
		sectionTitleRow("Charts & Trends"),
		sectionSubtitleRow("Visual breakdown of the platform's organizations, users, and enrollment activity."),
		row.New(6),
	}

	rows = append(rows, chartSectionRows("Organizations by Plan", data.OrgsByPlan)...)
	rows = append(rows, row.New(6))
	rows = append(rows, chartSectionRows("Organizations by Status", data.OrgsByStatus)...)
	rows = append(rows, row.New(6))
	rows = append(rows, chartSectionRows("Users by Role", data.UsersByRole)...)
	rows = append(rows, row.New(6))
	rows = append(rows, chartSectionRows("New Enrollments — Last 6 Months", trendToBuckets(data.EnrollmentTrend))...)

	return page.New().Add(rows...)
}

func trendToBuckets(points []TrendPoint) []CountBucket {
	out := make([]CountBucket, 0, len(points))
	for _, p := range points {
		out = append(out, CountBucket{Label: p.Label, Count: p.Count})
	}
	return out
}

// chartSectionRows renders one titled bar-chart block for a set of labeled counts.
func chartSectionRows(title string, buckets []CountBucket) []core.Row {
	rows := []core.Row{
		row.New(8).Add(col.New(12).Add(
			text.New(title, props.Text{Size: 11, Style: fontstyle.Bold, Color: navyColor}),
		)),
	}
	if len(buckets) == 0 {
		rows = append(rows, row.New(6).Add(col.New(12).Add(
			text.New("No data yet.", props.Text{Size: 8.5, Style: fontstyle.Italic, Color: mutedColor}),
		)))
		return rows
	}

	max := 0
	for _, b := range buckets {
		if b.Count > max {
			max = b.Count
		}
	}
	if max == 0 {
		max = 1
	}

	for i, b := range buckets {
		filled := int((float64(b.Count) / float64(max)) * 8)
		if filled > 8 && b.Count > 0 {
			filled = 8
		}
		if filled == 0 && b.Count > 0 {
			filled = 1 // always show a sliver for non-zero counts
		}
		cols := []core.Col{
			text.NewCol(3, b.Label, props.Text{Size: 8, Color: slateColor, Top: 1}),
		}
		if filled > 0 {
			cols = append(cols, col.New(filled).WithStyle(&props.Cell{BackgroundColor: chartColor(i)}))
		}
		if filled < 8 {
			cols = append(cols, col.New(8-filled))
		}
		cols = append(cols, text.NewCol(1, fmt.Sprintf("%d", b.Count), props.Text{Size: 8, Style: fontstyle.Bold, Align: align.Right, Color: navyColor, Top: 1}))
		rows = append(rows, row.New(6).Add(cols...))
	}
	return rows
}
