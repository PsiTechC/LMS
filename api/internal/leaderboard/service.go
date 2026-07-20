package leaderboard

import (
	"errors"
	"sort"
	"time"

	"github.com/google/uuid"
)

// getMyLeaderboardService assembles the participant's Leaderboard tab: their
// points breakdown, cohort ranking, streak, and badges - all from real signals.
// programID (optional) scopes to the program the participant is currently
// viewing, so multi-program participants see the right per-program leaderboard.
func getMyLeaderboardService(userID uuid.UUID, programID *uuid.UUID) (*MyLeaderboardDTO, error) {
	dto := &MyLeaderboardDTO{
		ShowOnLeaderboard: true,
		Leaders:           []LeaderRowDTO{},
		Badges:            []BadgeDTO{},
	}

	cohort, err := findMyCohort(userID, programID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return dto, nil // not enrolled - HasCohort stays false
		}
		return nil, err
	}
	dto.HasCohort = true
	dto.CohortName = cohort.CohortName
	dto.ShowOnLeaderboard = cohort.ShowOnLeaderboard

	cohortID := uuid.MustParse(cohort.CohortID)
	progID, err := programIDForCohort(cohortID)
	if err != nil {
		return nil, err
	}

	// My breakdown.
	myCounts, err := countsForUser(userID, progID)
	if err != nil {
		return nil, err
	}
	dto.Breakdown, err = persistedBreakdown(userID, progID)
	if err != nil {
		return nil, err
	}
	dto.MyPoints = dto.Breakdown.Total

	// Cohort ranking - compute points for every member, sort desc.
	members, err := cohortMembers(cohortID)
	if err != nil {
		return nil, err
	}
	type scored struct {
		member cohortMemberRow
		points int
		streak int
	}
	scoredMembers := make([]scored, 0, len(members))
	for _, m := range members {
		mid := uuid.MustParse(m.UserID)
		var pts int
		if mid == userID {
			pts = dto.MyPoints
		} else {
			b, e := persistedBreakdown(mid, progID)
			if e != nil {
				return nil, e
			}
			pts = b.Total
		}
		streak, _ := currentStreak(mid)
		scoredMembers = append(scoredMembers, scored{member: m, points: pts, streak: streak})
	}
	sort.SliceStable(scoredMembers, func(i, j int) bool { return scoredMembers[i].points > scoredMembers[j].points })

	for i, sm := range scoredMembers {
		rank := i + 1
		isYou := sm.member.UserID == userID.String()
		if isYou {
			r := rank
			dto.MyRank = &r
		}
		// Respect opt-out: other participants who opted out are hidden from the
		// list (their rank still counts, but they aren't shown). You always see
		// yourself.
		if !isYou && !sm.member.ShowOnLeaderboard {
			continue
		}
		dto.Leaders = append(dto.Leaders, LeaderRowDTO{
			Rank: rank, UserID: sm.member.UserID, Name: sm.member.Name,
			Points: sm.points, Streak: sm.streak, IsYou: isYou,
		})
	}

	// Badges + streak (mine).
	myStreakCur, myStreakLong := streaks(userID)
	maxMins, _ := maxModuleMinutes(userID, progID)
	p1, _ := phase1Complete(userID, progID)
	stats := participantStats{
		counts: myCounts, currentStreak: myStreakCur, longestStreak: myStreakLong,
		phase1Complete: p1, maxModuleMins: maxMins,
	}
	for _, b := range badgeCatalog {
		dto.Badges = append(dto.Badges, BadgeDTO{Key: b.Key, Name: b.Name, Description: b.Description, Earned: b.earned(stats)})
	}

	return dto, nil
}

// listAdminLeaderboardService builds the superadmin cross-org rankings. It
// reuses the SAME points derivation as the participant /my endpoint
// (countsForUser → breakdownFromCounts) plus streaks + program progress - only
// difference is it runs over every opted-in enrollment, not one user. orgID ""
// = all orgs. Returns both a flat participant ranking and an org aggregation.
func listAdminLeaderboardService(orgID string) (*AdminLeaderboardDTO, error) {
	dto := &AdminLeaderboardDTO{
		Participants:  []AdminLeaderRowDTO{},
		Organizations: []AdminOrgRowDTO{},
	}

	enrollments, err := listOptedInEnrollments(orgID)
	if err != nil {
		return nil, err
	}

	rows := make([]AdminLeaderRowDTO, 0, len(enrollments))
	for _, e := range enrollments {
		uid := uuid.MustParse(e.UserID)
		pid := uuid.MustParse(e.ProgramID)

		breakdown, err := persistedBreakdown(uid, pid)
		if err != nil {
			return nil, err
		}
		points := breakdown.Total
		streak, _ := currentStreak(uid)
		progress, _ := programProgress(uid, pid)

		rows = append(rows, AdminLeaderRowDTO{
			UserID:      e.UserID,
			Participant: e.Name,
			Org:         e.Org,
			OrgID:       e.OrgID,
			Program:     e.Program,
			Points:      points,
			Streak:      streak,
			Progress:    progress,
			Change:      nil, // no historical snapshot - genuinely unavailable
		})
	}

	// Rank participants by points desc (stable → ties keep org/name order).
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].Points > rows[j].Points })
	for i := range rows {
		rows[i].Rank = i + 1
	}
	dto.Participants = rows

	// Aggregate by organization from the same rows.
	type orgAgg struct {
		org, orgID           string
		participants, points int
		progressSum          int
	}
	order := []string{}
	byOrg := map[string]*orgAgg{}
	for _, r := range rows {
		a, ok := byOrg[r.OrgID]
		if !ok {
			a = &orgAgg{org: r.Org, orgID: r.OrgID}
			byOrg[r.OrgID] = a
			order = append(order, r.OrgID)
		}
		a.participants++
		a.points += r.Points
		a.progressSum += r.Progress
	}
	orgRows := make([]AdminOrgRowDTO, 0, len(order))
	for _, id := range order {
		a := byOrg[id]
		avgPts, avgProg := 0, 0
		if a.participants > 0 {
			avgPts = a.points / a.participants
			avgProg = a.progressSum / a.participants
		}
		orgRows = append(orgRows, AdminOrgRowDTO{
			Org: a.org, OrgID: a.orgID, Participants: a.participants,
			TotalPoints: a.points, AvgPoints: avgPts, AvgProgress: avgProg,
		})
	}
	sort.SliceStable(orgRows, func(i, j int) bool { return orgRows[i].TotalPoints > orgRows[j].TotalPoints })
	for i := range orgRows {
		orgRows[i].Rank = i + 1
	}
	dto.Organizations = orgRows

	return dto, nil
}

// setVisibilityService toggles the participant's leaderboard opt-in for the
// cohort in the given program (or most-recent enrollment when programID is nil).
func setVisibilityService(userID uuid.UUID, programID *uuid.UUID, show bool) (*MyLeaderboardDTO, error) {
	cohort, err := findMyCohort(userID, programID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if err := setVisibility(userID, uuid.MustParse(cohort.CohortID), show); err != nil {
		return nil, err
	}
	return getMyLeaderboardService(userID, programID)
}

// ── helpers ───────────────────────────────────────────────────────

func breakdownFromCounts(c categoryCounts) PointsBreakdownDTO {
	b := PointsBreakdownDTO{
		ModuleCompletions:  c.Modules * PointsPerModule,
		Assessments:        c.Assessments * PointsPerAssessment,
		Discussions:        c.Discussions * PointsPerDiscussion,
		Reflections:        c.Reflections * PointsPerReflection,
		CoachingAttendance: c.Coaching * PointsPerCoaching,
	}
	b.Total = b.ModuleCompletions + b.Assessments + b.Discussions + b.Reflections + b.CoachingAttendance
	return b
}

func currentStreak(userID uuid.UUID) (int, error) {
	cur, _ := streaks(userID)
	return cur, nil
}

// streaks computes current + longest consecutive-day engagement streaks from
// the user's active days.
func streaks(userID uuid.UUID) (current int, longest int) {
	days, err := activeDays(userID)
	if err != nil || len(days) == 0 {
		return 0, 0
	}
	// Normalize to date-only, unique, sorted DESC (query already sorts DESC).
	norm := make([]time.Time, 0, len(days))
	seen := map[string]bool{}
	for _, d := range days {
		key := d.Format("2006-01-02")
		if seen[key] {
			continue
		}
		seen[key] = true
		norm = append(norm, d.Truncate(24*time.Hour))
	}

	// Current streak: counts back from today or yesterday.
	today := time.Now().Truncate(24 * time.Hour)
	if len(norm) > 0 && (sameDay(norm[0], today) || sameDay(norm[0], today.AddDate(0, 0, -1))) {
		current = 1
		for i := 1; i < len(norm); i++ {
			if sameDay(norm[i], norm[i-1].AddDate(0, 0, -1)) {
				current++
			} else {
				break
			}
		}
	}

	// Longest streak across all days.
	longest = 1
	run := 1
	for i := 1; i < len(norm); i++ {
		if sameDay(norm[i], norm[i-1].AddDate(0, 0, -1)) {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
	}
	if len(norm) == 0 {
		longest = 0
	}
	return current, longest
}

func sameDay(a, b time.Time) bool { return a.Year() == b.Year() && a.YearDay() == b.YearDay() }

func persistedBreakdown(userID, programID uuid.UUID) (PointsBreakdownDTO, error) {
	m, a, d, r, c, err := AwardedBreakdown(userID, programID)
	if err != nil {
		return PointsBreakdownDTO{}, err
	}
	return PointsBreakdownDTO{ModuleCompletions: m, Assessments: a, Discussions: d, Reflections: r, CoachingAttendance: c, Total: m + a + d + r + c}, nil
}
