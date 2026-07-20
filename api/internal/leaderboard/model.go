package leaderboard

// Points are derived from real activity signals - there is no points ledger.
// These weights define how each category converts to points. Centralised here
// so a future admin config (org settings) can override them without touching
// query code.
const (
	PointsPerModule     = 60  // completed content activity (video/pdf/case_study)
	PointsPerAssessment = 120 // submitted assessment
	PointsPerDiscussion = 40  // thread or reply authored
	PointsPerReflection = 70  // submitted journal/reflection
	PointsPerCoaching   = 40  // coaching session attended (engagement completed_sessions)
)

// categoryPoints is the raw per-category count → the DTO multiplies by weight.
type categoryCounts struct {
	Modules     int
	Assessments int
	Discussions int
	Reflections int
	Coaching    int
}

// BadgeDef is a rule-based badge evaluated from real signals. Adding a badge is
// a data change here (keeps room for org-configurable badges later).
type BadgeDef struct {
	Key         string
	Name        string
	Description string
	// earned returns true when the participant's stats satisfy the badge.
	earned func(s participantStats) bool
}

// participantStats is the real signal snapshot used for badges + streaks.
type participantStats struct {
	counts         categoryCounts
	currentStreak  int
	longestStreak  int
	phase1Complete bool
	maxModuleMins  int
}

// badgeCatalog - the achievement criteria (tooltips in the UI).
var badgeCatalog = []BadgeDef{
	{Key: "fast_starter", Name: "Fast Starter", Description: "Completed all Phase 1 activities",
		earned: func(s participantStats) bool { return s.phase1Complete }},
	{Key: "deep_diver", Name: "Deep Diver", Description: "Spent 3+ hours on a single module",
		earned: func(s participantStats) bool { return s.maxModuleMins >= 180 }},
	{Key: "team_player", Name: "Team Player", Description: "Contributed to 5 discussions",
		earned: func(s participantStats) bool { return s.counts.Discussions >= 5 }},
	{Key: "assessor", Name: "Assessor", Description: "Completed 3 assessments",
		earned: func(s participantStats) bool { return s.counts.Assessments >= 3 }},
	{Key: "streak_champion", Name: "Streak Champion", Description: "7-day engagement streak",
		earned: func(s participantStats) bool { return s.longestStreak >= 7 }},
}
