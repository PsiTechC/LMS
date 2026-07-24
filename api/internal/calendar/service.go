package calendar

import (
	"time"
)

// computeStatus returns the calendar display status for a session based on
// stored values + real wall-clock time, matching the logic in sessions/service.go.
func computeStatus(scheduledAt time.Time, durationMins int, startedAt, endedAt *time.Time, storedStatus string) string {
	now := time.Now().UTC()
	end := scheduledAt.UTC().Add(time.Duration(durationMins) * time.Minute)
	liveGrace := end.Add(24 * time.Hour)

	switch {
	case endedAt != nil || storedStatus == "completed" || !now.Before(liveGrace):
		return "done"
	case !now.Before(scheduledAt.UTC()) || startedAt != nil:
		return "live_now"
	default:
		return "upcoming"
	}
}

func sessionRowToDTO(r calendarSessionRow) CalendarEventDTO {
	status := computeStatus(r.ScheduledAt, r.DurationMins, r.StartedAt, r.EndedAt, r.StoredStatus)
	sessionType := "classroom"
	dto := CalendarEventDTO{
		ID:               r.ID,
		Title:            r.Title,
		Type:             "session",
		ScheduledAt:      r.ScheduledAt.UTC().Format(time.RFC3339),
		DurationMins:     r.DurationMins,
		Status:           status,
		ProgramID:        r.ProgramID,
		ProgramTitle:     r.ProgramTitle,
		ProgramColor:     r.ProgramColor,
		OrgID:            r.OrgID,
		OrgName:          r.OrgName,
		CohortID:         r.CohortID,
		CohortName:       r.CohortName,
		FacultyName:      r.FacultyName,
		ParticipantCount: r.ParticipantCount,
		VirtualLink:      r.VirtualLink,
		JoinURL:          r.JoinURL,
		MeetingType:      r.MeetingType,
		Location:         r.Location,
		SessionType:      sessionType,
	}
	return dto
}

func coachingRowToDTO(r calendarCoachingRow) CalendarEventDTO {
	status := computeStatus(r.ScheduledAt, r.DurationMins, r.StartedAt, r.EndedAt, r.StoredStatus)
	sessionType := "coaching_individual"
	if r.SessionType == "group" {
		sessionType = "coaching_group"
	}
	coachName := r.CoachName
	dto := CalendarEventDTO{
		ID:               r.ID,
		Title:            r.Title,
		Type:             "coaching",
		ScheduledAt:      r.ScheduledAt.UTC().Format(time.RFC3339),
		DurationMins:     r.DurationMins,
		Status:           status,
		ProgramID:        r.ProgramID,
		ProgramTitle:     r.ProgramTitle,
		ProgramColor:     r.ProgramColor,
		OrgID:            r.OrgID,
		OrgName:          r.OrgName,
		CohortID:         r.CohortID,
		CohortName:       r.CohortName,
		CoachName:        &coachName,
		ParticipantCount: r.ParticipantCount,
		VirtualLink:      r.VirtualLink,
		JoinURL:          r.JoinURL,
		MeetingType:      r.MeetingType,
		SessionType:      sessionType,
	}
	return dto
}

// listCalendarEventsService is the core dispatcher. Role decides which filter
// parameters are used — the repository handles all filtering in SQL.
func listCalendarEventsService(role, userID, orgID, programID, eventType, from, to string) ([]CalendarEventDTO, error) {
	var events []CalendarEventDTO

	facultyUserID := ""
	if role == "faculty" {
		facultyUserID = userID
	}

	includeSessions := eventType == "" || eventType == "all" || eventType == "session"
	includeCoaching := eventType == "" || eventType == "all" || eventType == "coaching"

	if includeSessions {
		rows, err := listClassSessions(orgID, programID, facultyUserID, from, to)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			events = append(events, sessionRowToDTO(r))
		}
	}

	if includeCoaching && role != "faculty" {
		rows, err := listCoachingSessions(orgID, programID, "", from, to)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			events = append(events, coachingRowToDTO(r))
		}
	}

	// Sort merged slice by scheduled_at ascending
	for i := 1; i < len(events); i++ {
		for j := i; j > 0 && events[j].ScheduledAt < events[j-1].ScheduledAt; j-- {
			events[j], events[j-1] = events[j-1], events[j]
		}
	}

	if events == nil {
		events = []CalendarEventDTO{}
	}
	return events, nil
}
