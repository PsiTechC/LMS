package classify

// InitSchema is a no-op — classification results are returned to the
// caller to persist against their own domain tables (e.g. surveys,
// content), not stored here.
func InitSchema() error { return nil }
