package reports

import (
	"bytes"
	"os"
	"testing"
)

// TestGenerateSamplePDF renders the platform report against mock data,
// asserts the output is a well-formed PDF, and (only when SAMPLE_PDF_OUT is
// set) additionally writes it to disk so the visual output can be inspected
// by hand: SAMPLE_PDF_OUT=/path/out.pdf go test ./internal/reports/... -run TestGenerateSamplePDF -v
func TestGenerateSamplePDF(t *testing.T) {
	data := &PlatformReportData{
		GeneratedOn:       "19 July 2026, 10:30",
		TotalOrgs:         5,
		ActiveOrgs:        3,
		TotalSeats:        850,
		TotalUsers:        612,
		TotalPrograms:     14,
		PublishedPrograms: 11,
		TotalCohorts:      22,
		TotalEnrollments:  480,
		AvgCompletionPct:  67.4,
		Organizations: []OrgReportRow{
			{Name: "Acme Corp", Slug: "acme", Plan: "enterprise", Status: "active", Seats: 300, MemberCount: 245, ProgramCount: 6, EnrollmentCount: 190, AvgCompletionPct: 72.1},
			{Name: "Globex Inc", Slug: "globex", Plan: "pro", Status: "active", Seats: 200, MemberCount: 150, ProgramCount: 4, EnrollmentCount: 120, AvgCompletionPct: 58.3},
			{Name: "Initech", Slug: "initech", Plan: "starter", Status: "trial", Seats: 50, MemberCount: 30, ProgramCount: 2, EnrollmentCount: 40, AvgCompletionPct: 45.0},
			{Name: "Umbrella LLC", Slug: "umbrella", Plan: "pro", Status: "onboarding", Seats: 150, MemberCount: 80, ProgramCount: 1, EnrollmentCount: 60, AvgCompletionPct: 20.0},
			{Name: "Wayne Enterprises", Slug: "wayne", Plan: "enterprise", Status: "suspended", Seats: 150, MemberCount: 107, ProgramCount: 1, EnrollmentCount: 70, AvgCompletionPct: 88.9},
		},
		OrgsByPlan: []CountBucket{
			{Label: "enterprise", Count: 2},
			{Label: "pro", Count: 2},
			{Label: "starter", Count: 1},
		},
		OrgsByStatus: []CountBucket{
			{Label: "active", Count: 3},
			{Label: "trial", Count: 1},
			{Label: "onboarding", Count: 1},
			{Label: "suspended", Count: 1},
		},
		UsersByRole: []CountBucket{
			{Label: "participant", Count: 480},
			{Label: "faculty", Count: 60},
			{Label: "program_manager", Count: 40},
			{Label: "coach", Count: 25},
			{Label: "superadmin", Count: 7},
		},
		EnrollmentTrend: []TrendPoint{
			{Label: "Feb 2026", Count: 40},
			{Label: "Mar 2026", Count: 55},
			{Label: "Apr 2026", Count: 70},
			{Label: "May 2026", Count: 90},
			{Label: "Jun 2026", Count: 110},
			{Label: "Jul 2026", Count: 115},
		},
	}

	pdf, err := renderPlatformReportPDF(data)
	if err != nil {
		t.Fatalf("renderPlatformReportPDF failed: %v", err)
	}
	if len(pdf) == 0 {
		t.Fatal("renderPlatformReportPDF returned empty bytes")
	}
	if !bytes.HasPrefix(pdf, []byte("%PDF-")) {
		t.Fatalf("output does not start with a PDF header, got: %q", pdf[:min(20, len(pdf))])
	}

	if outPath := os.Getenv("SAMPLE_PDF_OUT"); outPath != "" {
		if err := os.WriteFile(outPath, pdf, 0o644); err != nil {
			t.Fatalf("failed to write sample PDF: %v", err)
		}
		t.Logf("wrote sample PDF (%d bytes) to %s", len(pdf), outPath)
	}
}

// TestGenerateSamplePDF_EmptyPlatform ensures the renderer degrades
// gracefully (no panic, still a valid PDF) when a platform has zero
// organizations/users/data — the empty-state path in organizationsPages and
// chartSectionRows.
func TestGenerateSamplePDF_EmptyPlatform(t *testing.T) {
	pdf, err := renderPlatformReportPDF(&PlatformReportData{GeneratedOn: "19 July 2026"})
	if err != nil {
		t.Fatalf("renderPlatformReportPDF failed on empty data: %v", err)
	}
	if !bytes.HasPrefix(pdf, []byte("%PDF-")) {
		t.Fatalf("empty-data output is not a valid PDF header")
	}
}
