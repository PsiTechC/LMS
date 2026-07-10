package recommend

// Recommendation is one suggested next step for a participant (Adaptive
// Learning Path) or a program design change (PM's Program Design
// Recommender) — the same shape serves both, differing only in scope.
type Recommendation struct {
	Title    string `json:"title"`
	Reason   string `json:"reason"`
	Priority int    `json:"priority"` // 1 = highest
}
