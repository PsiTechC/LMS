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
	orgID, err := orgIDForProgram(progID)
	if err != nil {
		return nil, err
	}
	progIDStr := progID.String()

	// My breakdown + cohort ranking now both come from activity_scores (the
	// approved engagement/speed/quality model), replacing the old
	// per-category leaderboard_awards-derived breakdown. Badges/streaks below
	// are UNCHANGED - they're derived from raw activity_progress/submissions
	// signals independent of either points model.
	myCounts, err := countsForUser(userID, progID)
	if err != nil {
		return nil, err
	}

	// Program-wide ranked summaries, then filtered to this cohort's roster -
	// RankOrganizationLearners is org+program scoped (requirement #10); a
	// program can have multiple cohorts, so ranking must be re-computed
	// within just this cohort's members, not the whole program's.
	programRanked, err := RankOrganizationLearners(orgID, &progIDStr, nil)
	if err != nil {
		return nil, err
	}
	byLearner := make(map[string]LearnerScoreSummary, len(programRanked))
	for _, s := range programRanked {
		byLearner[s.LearnerID] = s
	}

	members, err := cohortMembers(cohortID)
	if err != nil {
		return nil, err
	}
	cohortSummaries := make([]LearnerScoreSummary, 0, len(members))
	memberByID := make(map[string]cohortMemberRow, len(members))
	for _, m := range members {
		memberByID[m.UserID] = m
		if s, ok := byLearner[m.UserID]; ok {
			cohortSummaries = append(cohortSummaries, s)
		} else {
			// No activity_scores rows yet for this member (nothing scored
			// under the new model so far) - a real zero standing, not an
			// error; still ranked (last), consistent with everyone else.
			cohortSummaries = append(cohortSummaries, LearnerScoreSummary{LearnerID: m.UserID})
		}
	}
	ranked := RankLearnerScores(cohortSummaries)

	for i, s := range ranked {
		rank := i + 1
		m := memberByID[s.LearnerID]
		isYou := s.LearnerID == userID.String()
		if isYou {
			r := rank
			dto.MyRank = &r
			dto.Breakdown = PointsBreakdownDTO{
				EngagementScore: s.EngagementScoreTotal,
				SpeedScore:      s.SpeedScoreTotal,
				QualityScore:    s.QualityScoreTotal,
				EarnedTotal:     s.EarnedTotal,
				MaximumTotal:    s.MaximumTotal,
				Percentage:      s.Percentage(),
				Total:           s.EarnedTotal,
			}
			dto.MyPoints = s.EarnedTotal
		}
		streak, _ := currentStreak(uuid.MustParse(s.LearnerID))
		// Respect opt-out: other participants who opted out are hidden from the
		// list (their rank still counts, but they aren't shown). You always see
		// yourself.
		if !isYou && !m.ShowOnLeaderboard {
			continue
		}
		dto.Leaders = append(dto.Leaders, LeaderRowDTO{
			Rank: rank, UserID: s.LearnerID, Name: m.Name,
			Points: s.EarnedTotal, Streak: streak, IsYou: isYou,
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
// (RankOrganizationLearners, scoped per (org, program) pair and cached since
// many enrollments share the same pair) plus streaks + program progress -
// only difference is it runs over every opted-in enrollment, not one user.
// orgID "" = all orgs. Returns both a flat participant ranking and an org
// aggregation. Ranked via the shared lessLearnerScoreSummary comparator
// directly (not RankLearnerScores) since the SAME learner can legitimately
// appear more than once here (once per program enrollment).
func listAdminLeaderboardService(orgID string) (*AdminLeaderboardDTO, error) {
	dto := &AdminLeaderboardDTO{
		Participants:  []AdminLeaderRowDTO{},
		Organizations: []AdminOrgRowDTO{},
	}

	enrollments, err := listOptedInEnrollments(orgID)
	if err != nil {
		return nil, err
	}

	// One (learner, program) pair per enrollment row - the SAME physical
	// learner enrolled in multiple programs legitimately appears more than
	// once, so this can't be ranked via RankLearnerScores (which assumes one
	// row per distinct learner ID); it uses the same centralized
	// lessLearnerScoreSummary comparator directly instead (requirement #2 -
	// one rule, not a re-implementation of it).
	type adminRow struct {
		dto     AdminLeaderRowDTO
		summary LearnerScoreSummary
	}
	rankedCache := map[string][]LearnerScoreSummary{} // "orgID|programID" -> that scope's ranked summaries
	pairs := make([]adminRow, 0, len(enrollments))
	for _, e := range enrollments {
		uid := uuid.MustParse(e.UserID)
		pid := uuid.MustParse(e.ProgramID)

		cacheKey := e.OrgID + "|" + e.ProgramID
		scoped, ok := rankedCache[cacheKey]
		if !ok {
			progIDStr := e.ProgramID
			scoped, err = RankOrganizationLearners(e.OrgID, &progIDStr, nil)
			if err != nil {
				return nil, err
			}
			rankedCache[cacheKey] = scoped
		}
		summary := LearnerScoreSummary{LearnerID: e.UserID} // real zero standing if nothing scored yet
		for _, s := range scoped {
			if s.LearnerID == e.UserID {
				summary = s
				break
			}
		}

		streak, _ := currentStreak(uid)
		progress, _ := programProgress(uid, pid)

		pairs = append(pairs, adminRow{
			dto: AdminLeaderRowDTO{
				UserID:      e.UserID,
				Participant: e.Name,
				Org:         e.Org,
				OrgID:       e.OrgID,
				Program:     e.Program,
				Points:      summary.EarnedTotal,
				Streak:      streak,
				Progress:    progress,
				Change:      nil, // no historical snapshot - genuinely unavailable
			},
			summary: summary,
		})
	}

	sort.SliceStable(pairs, func(i, j int) bool { return lessLearnerScoreSummary(pairs[i].summary, pairs[j].summary) })
	rows := make([]AdminLeaderRowDTO, len(pairs))
	for i, p := range pairs {
		p.dto.Rank = i + 1
		rows[i] = p.dto
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
