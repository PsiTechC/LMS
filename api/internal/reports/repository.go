package reports

import (
	"github.com/xa-lms/api/pkg/database"
)

// This module reads domain tables (organizations, org_members, programs,
// cohorts, enrollments, users) directly via raw SQL rather than importing
// those modules' Go packages. Per CLAUDE.md this is the accepted convention
// for cross-cutting, read-only, platform-wide aggregation (same pattern
// internal/ai/aggregate and internal/ai/riskscoring already use) - it is not
// a violation of the "modules never import each other" rule, which governs
// domain-to-domain business logic, not this kind of reporting rollup.

type orgRow struct {
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

// fetchOrgRows returns one row per organization with rolled-up member,
// program, and enrollment/completion counts for the report table.
func fetchOrgRows() ([]orgRow, error) {
	var rows []orgRow
	err := database.DB.Raw(`
		SELECT
			o.name,
			o.slug,
			o.plan::text  AS plan,
			o.status::text AS status,
			o.seats,
			COALESCE(m.member_count, 0)  AS member_count,
			COALESCE(p.program_count, 0) AS program_count,
			COALESCE(e.enrollment_count, 0) AS enrollment_count,
			COALESCE(e.avg_completion_pct, 0) AS avg_completion_pct
		FROM organizations o
		LEFT JOIN (
			SELECT org_id, COUNT(*) AS member_count
			FROM org_members
			GROUP BY org_id
		) m ON m.org_id = o.id
		LEFT JOIN (
			SELECT org_id, COUNT(*) AS program_count
			FROM programs
			GROUP BY org_id
		) p ON p.org_id = o.id
		LEFT JOIN (
			SELECT c.org_id,
			       COUNT(en.id) AS enrollment_count,
			       COALESCE(AVG(en.completion_percent) FILTER (WHERE en.status <> 'withdrawn'), 0) AS avg_completion_pct
			FROM cohorts c
			LEFT JOIN enrollments en ON en.cohort_id = c.id
			GROUP BY c.org_id
		) e ON e.org_id = o.id
		ORDER BY o.name ASC
	`).Scan(&rows).Error
	return rows, err
}

type countRow struct {
	Label string
	Count int
}

// orgsByPlan buckets organizations by plan for the "Organizations by Plan" chart.
func orgsByPlan() ([]countRow, error) {
	var rows []countRow
	err := database.DB.Raw(`
		SELECT plan::text AS label, COUNT(*) AS count
		FROM organizations
		GROUP BY plan
		ORDER BY count DESC
	`).Scan(&rows).Error
	return rows, err
}

// orgsByStatus buckets organizations by status for the "Organizations by Status" chart.
func orgsByStatus() ([]countRow, error) {
	var rows []countRow
	err := database.DB.Raw(`
		SELECT status::text AS label, COUNT(*) AS count
		FROM organizations
		GROUP BY status
		ORDER BY count DESC
	`).Scan(&rows).Error
	return rows, err
}

// usersByRole buckets platform users by role for the "Users by Role" chart.
func usersByRole() ([]countRow, error) {
	var rows []countRow
	err := database.DB.Raw(`
		SELECT role::text AS label, COUNT(*) AS count
		FROM users
		GROUP BY role
		ORDER BY count DESC
	`).Scan(&rows).Error
	return rows, err
}

// platformTotals rolls up the headline summary cards in a single query.
type totalsRow struct {
	TotalOrgs         int
	ActiveOrgs        int
	TotalSeats        int
	TotalUsers        int
	TotalPrograms     int
	PublishedPrograms int
	TotalCohorts      int
	TotalEnrollments  int
	AvgCompletionPct  float64
}

func platformTotals() (totalsRow, error) {
	var r totalsRow
	err := database.DB.Raw(`
		SELECT
			(SELECT COUNT(*) FROM organizations) AS total_orgs,
			(SELECT COUNT(*) FROM organizations WHERE status = 'active') AS active_orgs,
			(SELECT COALESCE(SUM(seats), 0) FROM organizations) AS total_seats,
			(SELECT COUNT(*) FROM users) AS total_users,
			(SELECT COUNT(*) FROM programs) AS total_programs,
			(SELECT COUNT(*) FROM programs WHERE published_at IS NOT NULL) AS published_programs,
			(SELECT COUNT(*) FROM cohorts) AS total_cohorts,
			(SELECT COUNT(*) FROM enrollments) AS total_enrollments,
			(SELECT COALESCE(AVG(completion_percent) FILTER (WHERE status <> 'withdrawn'), 0) FROM enrollments) AS avg_completion_pct
	`).Scan(&r).Error
	return r, err
}

type trendRow struct {
	Label string
	Count int
}

// enrollmentTrend returns new-enrollment counts for each of the last 6
// calendar months (oldest first), for the enrollment trend chart.
func enrollmentTrend() ([]trendRow, error) {
	var rows []trendRow
	err := database.DB.Raw(`
		SELECT TO_CHAR(months.month, 'Mon YYYY') AS label, COALESCE(e.cnt, 0) AS count
		FROM (
			SELECT generate_series(
				date_trunc('month', NOW()) - interval '5 months',
				date_trunc('month', NOW()),
				interval '1 month'
			) AS month
		) months
		LEFT JOIN (
			SELECT date_trunc('month', enrolled_at) AS month, COUNT(*) AS cnt
			FROM enrollments
			GROUP BY date_trunc('month', enrolled_at)
		) e ON e.month = months.month
		ORDER BY months.month ASC
	`).Scan(&rows).Error
	return rows, err
}
