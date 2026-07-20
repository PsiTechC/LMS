package reports

// PlatformReportData is everything the PDF renderer needs for the
// platform-wide Super Admin export - pre-aggregated so the render step has no
// DB access of its own (same separation as feedback360's ReportData/report.go).
type PlatformReportData struct {
	GeneratedOn string

	// Headline counts (top-of-report summary cards).
	TotalOrgs         int
	ActiveOrgs        int
	TotalSeats        int
	TotalUsers        int
	TotalPrograms     int
	PublishedPrograms int
	TotalCohorts      int
	TotalEnrollments  int
	AvgCompletionPct  float64

	// Organizations table - one row per org, all SA-visible fields.
	Organizations []OrgReportRow

	// Chart data.
	OrgsByPlan      []CountBucket // bar chart: plan -> org count
	OrgsByStatus    []CountBucket // bar chart: status -> org count
	UsersByRole     []CountBucket // bar chart: role -> user count
	EnrollmentTrend []TrendPoint  // line/bar chart: month -> new enrollments (last 6 months)
}

// OrgReportRow is one organization's row in the report table.
type OrgReportRow struct {
	Name             string
	Slug             string
	Plan             string
	Status           string
	Seats            int
	MemberCount      int
	ProgramCount     int
	EnrollmentCount  int
	AvgCompletionPct float64
}

// CountBucket is a labeled count used for simple bar charts.
type CountBucket struct {
	Label string
	Count int
}

// TrendPoint is a labeled count over time, used for the enrollment trend chart.
type TrendPoint struct {
	Label string
	Count int
}
