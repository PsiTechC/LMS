package leaderboard

import (
	"errors"
	"sort"
	"time"

	"github.com/google/uuid"
)

// getMyLeaderboardService assembles the participant's Leaderboard tab: their
// points breakdown, cohort ranking, streak, and badges — all from real signals.
func getMyLeaderboardService(userID uuid.UUID) (*MyLeaderboardDTO, error) {
	dto := &MyLeaderboardDTO{
		ShowOnLeaderboard: true,
		Leaders:           []LeaderRowDTO{},
		Badges:            []BadgeDTO{},
	}

	cohort, err := findMyCohort(userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return dto, nil // not enrolled — HasCohort stays false
		}
		return nil, err
	}
	dto.HasCohort = true
	dto.CohortName = cohort.CohortName
	dto.ShowOnLeaderboard = cohort.ShowOnLeaderboard

	cohortID := uuid.MustParse(cohort.CohortID)
	programID, err := programIDForCohort(cohortID)
	if err != nil {
		return nil, err
	}

	// My breakdown.
	myCounts, err := countsForUser(userID, programID)
	if err != nil {
		return nil, err
	}
	dto.Breakdown = breakdownFromCounts(myCounts)
	dto.MyPoints = dto.Breakdown.Total

	// Cohort ranking — compute points for every member, sort desc.
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
			cnt, e := countsForUser(mid, programID)
			if e != nil {
				return nil, e
			}
			pts = breakdownFromCounts(cnt).Total
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
	maxMins, _ := maxModuleMinutes(userID, programID)
	p1, _ := phase1Complete(userID, programID)
	stats := participantStats{
		counts: myCounts, currentStreak: myStreakCur, longestStreak: myStreakLong,
		phase1Complete: p1, maxModuleMins: maxMins,
	}
	for _, b := range badgeCatalog {
		dto.Badges = append(dto.Badges, BadgeDTO{Key: b.Key, Name: b.Name, Description: b.Description, Earned: b.earned(stats)})
	}

	return dto, nil
}

// setVisibilityService toggles the participant's leaderboard opt-in.
func setVisibilityService(userID uuid.UUID, show bool) (*MyLeaderboardDTO, error) {
	cohort, err := findMyCohort(userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if err := setVisibility(userID, uuid.MustParse(cohort.CohortID), show); err != nil {
		return nil, err
	}
	return getMyLeaderboardService(userID)
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
