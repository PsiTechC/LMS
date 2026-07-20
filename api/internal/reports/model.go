package reports

// This module owns no tables of its own - it only aggregates existing
// domain tables (organizations, org_members, programs, cohorts, enrollments,
// users) read-only for report generation. No GORM models / InitSchema needed.
