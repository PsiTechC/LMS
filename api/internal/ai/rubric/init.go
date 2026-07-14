package rubric

// InitSchema is a no-op for now — rubric grading results are returned to
// the caller (e.g. capstone/submissions) to persist against their own
// tables, not stored here. Kept as a function so the package fits the same
// InitSchema() convention every other ai engine follows, in case a grading
// cache/audit table is added later.
func InitSchema() error { return nil }
