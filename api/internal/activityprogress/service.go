package activityprogress

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/leaderboard"
	"gorm.io/gorm"
)

var ErrForbidden = errors.New("not enrolled in this program")

// upsertProgressService creates or updates a participant's progress for one
// activity, then recomputes their enrollment completion %. It verifies the
// participant is enrolled in the activity's program before writing.
func upsertProgressService(userID uuid.UUID, req UpsertProgressRequest) (*ProgressDTO, error) {
	actID, err := uuid.Parse(req.ActivityID)
	if err != nil {
		return nil, errors.New("invalid activity_id")
	}

	programID, err := programIDForActivity(actID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	enrollmentID, err := enrollmentForUserProgram(userID, programID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrForbidden
		}
		return nil, err
	}

	existing, err := getByUserAndActivity(userID, actID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	// Seed working state from the existing row (or zero values).
	pct := 0
	meta := progressMeta{}
	var startedAt *time.Time
	if existing != nil {
		pct = existing.PercentComplete
		meta = parseMeta(existing.MetaJSON)
		startedAt = existing.StartedAt
	}

	if req.ProgressPct != nil {
		pct = clampPct(*req.ProgressPct)
	}
	if req.LastPosition != nil && *req.LastPosition >= 0 {
		meta.LastPosition = *req.LastPosition
	}
	if req.Notes != nil {
		meta.Notes = *req.Notes
	}

	completed := pct >= 100
	if req.Completed != nil && *req.Completed {
		completed = true
		pct = 100
	}

	// Derive status from progress. Never downgrade a completed row unless pct
	// is explicitly below 100 with no completion flag.
	status := "in_progress"
	var completedAt *time.Time
	switch {
	case completed:
		status = "completed"
		if existing != nil && existing.CompletedAt != nil {
			completedAt = existing.CompletedAt
		} else {
			now := time.Now()
			completedAt = &now
		}
	case pct == 0 && meta.Notes == "" && meta.LastPosition == 0:
		status = "not_started"
	}

	// started_at is set the first time the participant makes any progress.
	if status != "not_started" && startedAt == nil {
		now := time.Now()
		startedAt = &now
	}

	metaBytes, err := json.Marshal(meta)
	if err != nil {
		return nil, err
	}

	if existing == nil {
		row := &ActivityProgress{
			ID:              uuid.New(),
			ActivityID:      actID,
			UserID:          userID,
			EnrollmentID:    enrollmentID,
			Status:          status,
			PercentComplete: pct,
			StartedAt:       startedAt,
			CompletedAt:     completedAt,
			MetaJSON:        metaBytes,
		}
		if err := createProgress(row); err != nil {
			return nil, err
		}
		existing = row
	} else {
		fields := map[string]any{
			"status":           status,
			"percent_complete": pct,
			"started_at":       startedAt,
			"completed_at":     completedAt,
			"meta_json":        metaBytes,
		}
		if err := updateProgress(existing.ID, fields); err != nil {
			return nil, err
		}
		existing.Status = status
		existing.PercentComplete = pct
		existing.StartedAt = startedAt
		existing.CompletedAt = completedAt
		existing.MetaJSON = metaBytes
	}

	// Persist one immutable award when the activity is completed. Calling this
	// for an already-completed row is safe: the ledger's unique key deduplicates
	// retries and concurrent requests.
	if status == "completed" && completedAt != nil {
		if err := leaderboard.AwardActivity(userID, actID, existing.ID, "", 0, *completedAt); err != nil {
			return nil, err
		}
	}

	// Keep enrollment completion in sync (best-effort; a failure here shouldn't
	// fail the participant's save).
	_ = recomputeEnrollmentCompletion(enrollmentID, userID, programID)

	dto := toDTO(*existing)
	return &dto, nil
}

// listMyProgramProgressService returns all of a participant's progress rows for
// one program (hydrates the Pre-Work grid in a single request).
func listMyProgramProgressService(userID uuid.UUID, programIDStr string) ([]ProgressDTO, error) {
	programID, err := uuid.Parse(programIDStr)
	if err != nil {
		return nil, errors.New("invalid program_id")
	}
	rows, err := listByUserForProgram(userID, programID)
	if err != nil {
		return nil, err
	}
	out := make([]ProgressDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, toDTO(r))
	}
	return out, nil
}

// getMyActivityProgressService returns a single progress row (or ErrNotFound).
func getMyActivityProgressService(userID uuid.UUID, activityIDStr string) (*ProgressDTO, error) {
	actID, err := uuid.Parse(activityIDStr)
	if err != nil {
		return nil, errors.New("invalid activity_id")
	}
	row, err := getByUserAndActivity(userID, actID)
	if err != nil {
		if errors.Is(err, ErrNotFound) || errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	dto := toDTO(*row)
	return &dto, nil
}

func toDTO(p ActivityProgress) ProgressDTO {
	meta := parseMeta(p.MetaJSON)
	dto := ProgressDTO{
		ID:            p.ID.String(),
		ActivityID:    p.ActivityID.String(),
		ParticipantID: p.UserID.String(),
		Status:        p.Status,
		ProgressPct:   p.PercentComplete,
		LastPosition:  meta.LastPosition,
	}
	if meta.Notes != "" {
		n := meta.Notes
		dto.Notes = &n
	}
	if p.CompletedAt != nil {
		s := p.CompletedAt.Format(time.RFC3339)
		dto.CompletedAt = &s
	}
	if p.StartedAt != nil {
		dto.UpdatedAt = p.StartedAt.Format(time.RFC3339)
	}
	if p.CompletedAt != nil {
		dto.UpdatedAt = p.CompletedAt.Format(time.RFC3339)
	}
	return dto
}

func parseMeta(raw []byte) progressMeta {
	var m progressMeta
	if len(raw) == 0 {
		return m
	}
	_ = json.Unmarshal(raw, &m)
	return m
}

func clampPct(v int) int {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}
