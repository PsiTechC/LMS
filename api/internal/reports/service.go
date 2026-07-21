package reports

import "time"

// buildPlatformReportData assembles every section of the platform-wide
// export in one place, so the PDF renderer (pdf.go) has no DB access of its
// own - mirrors feedback360's buildParticipantReportData / generateParticipantReportPDF split.
func buildPlatformReportData() (*PlatformReportData, error) {
	totals, err := platformTotals()
	if err != nil {
		return nil, err
	}

	orgRows, err := fetchOrgRows()
	if err != nil {
		return nil, err
	}
	orgs := make([]OrgReportRow, 0, len(orgRows))
	for _, r := range orgRows {
		orgs = append(orgs, OrgReportRow{
			Name:             r.Name,
			Slug:             r.Slug,
			Plan:             r.Plan,
			Status:           r.Status,
			Seats:            r.Seats,
			MemberCount:      r.MemberCount,
			ProgramCount:     r.ProgramCount,
			EnrollmentCount:  r.EnrollmentCount,
			AvgCompletionPct: r.AvgCompletionPct,
		})
	}

	byPlan, err := orgsByPlan()
	if err != nil {
		return nil, err
	}
	byStatus, err := orgsByStatus()
	if err != nil {
		return nil, err
	}
	byRole, err := usersByRole()
	if err != nil {
		return nil, err
	}
	trend, err := enrollmentTrend()
	if err != nil {
		return nil, err
	}

	toBuckets := func(rows []countRow) []CountBucket {
		out := make([]CountBucket, 0, len(rows))
		for _, r := range rows {
			out = append(out, CountBucket{Label: r.Label, Count: r.Count})
		}
		return out
	}
	toTrend := func(rows []trendRow) []TrendPoint {
		out := make([]TrendPoint, 0, len(rows))
		for _, r := range rows {
			out = append(out, TrendPoint{Label: r.Label, Count: r.Count})
		}
		return out
	}

	return &PlatformReportData{
		GeneratedOn:       time.Now().Format("2 January 2006, 15:04"),
		TotalOrgs:         totals.TotalOrgs,
		ActiveOrgs:        totals.ActiveOrgs,
		TotalSeats:        totals.TotalSeats,
		TotalUsers:        totals.TotalUsers,
		TotalPrograms:     totals.TotalPrograms,
		PublishedPrograms: totals.PublishedPrograms,
		TotalCohorts:      totals.TotalCohorts,
		TotalEnrollments:  totals.TotalEnrollments,
		AvgCompletionPct:  totals.AvgCompletionPct,
		Organizations:     orgs,
		OrgsByPlan:        toBuckets(byPlan),
		OrgsByStatus:      toBuckets(byStatus),
		UsersByRole:       toBuckets(byRole),
		EnrollmentTrend:   toTrend(trend),
	}, nil
}

// generatePlatformReportPDF is the single entry point the handler calls:
// aggregate the data, then render it.
func generatePlatformReportPDF() ([]byte, error) {
	data, err := buildPlatformReportData()
	if err != nil {
		return nil, err
	}
	return renderPlatformReportPDF(data)
}
