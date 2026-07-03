package programs

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/cache"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("not found")

// ── Programs ──────────────────────────────────────────────────────

func programsCacheKey(orgID string) string {
	return fmt.Sprintf("programs:org:%s", orgID)
}

func bustProgramsCache(orgID string) {
	cache.Del(programsCacheKey(orgID))
	// Also bust analytics overview since program counts change
	cache.Del(fmt.Sprintf("analytics:overview:org:%s", orgID))
}

func listProgramsByOrg(orgID string) ([]Program, error) {
	key := programsCacheKey(orgID)
	var cached []Program
	if err := cache.Get(key, &cached); err == nil {
		return cached, nil
	}
	var programs []Program
	err := database.DB.
		Where("org_id = ?", orgID).
		Order("created_at desc").
		Find(&programs).Error
	if err == nil {
		cache.Set(key, programs, 5*time.Minute)
	}
	return programs, err
}

func listAllPrograms() ([]Program, error) {
	var programs []Program
	err := database.DB.Order("created_at desc").Find(&programs).Error
	return programs, err
}

// listProgramsByFaculty returns programs the faculty created OR is assigned to
// via at least one activity in activity_faculty.
func listProgramsByFaculty(facultyID string) ([]Program, error) {
	var programs []Program
	err := database.DB.Raw(`
		SELECT DISTINCT p.*
		FROM programs p
		WHERE p.created_by = ?::uuid
		UNION
		SELECT DISTINCT p.*
		FROM programs p
		JOIN program_phases ph ON ph.program_id = p.id
		JOIN activities a ON a.phase_id = ph.id
		JOIN activity_faculty af ON af.activity_id = a.id
		WHERE af.faculty_user_id = ?::uuid
		ORDER BY created_at DESC
	`, facultyID, facultyID).Scan(&programs).Error
	return programs, err
}

// isFacultyAuthorisedForProgram returns true if the faculty created the program
// OR has at least one activity assignment within it.
func isFacultyAuthorisedForProgram(programID, facultyID string) (bool, error) {
	var count int64
	err := database.DB.Raw(`
		SELECT COUNT(*) FROM (
			SELECT 1 FROM programs
			WHERE id = ?::uuid AND created_by = ?::uuid
			UNION ALL
			SELECT 1
			FROM activity_faculty af
			JOIN activities a ON a.id = af.activity_id
			JOIN program_phases ph ON ph.id = a.phase_id
			WHERE ph.program_id = ?::uuid AND af.faculty_user_id = ?::uuid
			LIMIT 1
		) sub
	`, programID, facultyID, programID, facultyID).Scan(&count).Error
	return count > 0, err
}

func listActivePrograms() ([]Program, error) {
	var programs []Program
	err := database.DB.
		Where("status IN ('active','upcoming')").
		Order("created_at desc").
		Find(&programs).Error
	return programs, err
}

func getProgramByID(id string) (*Program, error) {
	var p Program
	err := database.DB.Where("id = ?", id).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &p, err
}

func getProgramWithPhases(id string) (*Program, error) {
	var p Program
	err := database.DB.
		Preload("Phases", func(db *gorm.DB) *gorm.DB {
			return db.Order("phase_number asc")
		}).
		Preload("Phases.Modules", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order asc")
		}).
		Preload("Phases.Modules.Activities", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order asc")
		}).
		Preload("Phases.Activities", func(db *gorm.DB) *gorm.DB {
			return db.Where("module_id IS NULL").Order("sort_order asc")
		}).
		Where("id = ?", id).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &p, err
}

func createProgram(p *Program) error {
	return database.DB.Create(p).Error
}

func saveProgram(p *Program) error {
	return database.DB.Save(p).Error
}

func deleteProgram(id string) error {
	res := database.DB.Where("id = ?", id).Delete(&Program{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func duplicateProgram(srcID string, newTitle string, createdBy string) (*Program, error) {
	src, err := getProgramWithPhases(srcID)
	if err != nil {
		return nil, err
	}
	newProg := &Program{
		OrgID:         src.OrgID,
		CreatedBy:     uuid.MustParse(createdBy),
		Title:         newTitle,
		Description:   src.Description,
		Status:        "draft",
		Color:         src.Color,
		DurationWeeks: src.DurationWeeks,
	}
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(newProg).Error; err != nil {
			return err
		}
		for _, ph := range src.Phases {
			newPhase := ProgramPhase{
				ProgramID:    newProg.ID,
				Title:        ph.Title,
				Description:  ph.Description,
				PhaseNumber:  ph.PhaseNumber,
				WeekLabel:    ph.WeekLabel,
				Color:        ph.Color,
				StartDay:     ph.StartDay,
				EndDay:       ph.EndDay,
				PhaseType:    ph.PhaseType,
				DeliveryMode: ph.DeliveryMode,
			}
			if err := tx.Create(&newPhase).Error; err != nil {
				return err
			}
			copyAct := func(act Activity, moduleID *uuid.UUID) error {
				newAct := Activity{
					PhaseID:      newPhase.ID,
					ModuleID:     moduleID,
					Slot:         act.Slot,
					Title:        act.Title,
					Description:  act.Description,
					Type:         act.Type,
					DeliveryMode: act.DeliveryMode,
					SortOrder:    act.SortOrder,
					DurationMins: act.DurationMins,
					DueDayOffset: act.DueDayOffset,
					StartDay:     act.StartDay,
					DurationDays: act.DurationDays,
					IsMandatory:  act.IsMandatory,
					ConfigJSON:   act.ConfigJSON,
				}
				return tx.Create(&newAct).Error
			}
			for _, mod := range ph.Modules {
				newModule := ProgramModule{
					PhaseID:      newPhase.ID,
					Title:        mod.Title,
					DeliveryMode: mod.DeliveryMode,
					SessionDate:  mod.SessionDate,
					SortOrder:    mod.SortOrder,
				}
				if err := tx.Create(&newModule).Error; err != nil {
					return err
				}
				for _, act := range mod.Activities {
					if err := copyAct(act, &newModule.ID); err != nil {
						return err
					}
				}
			}
			for _, act := range ph.Activities {
				if err := copyAct(act, nil); err != nil {
					return err
				}
			}
		}
		return nil
	})
	return newProg, err
}

func countPhasesAndActivities(programID string) (int, int, error) {
	var phaseCount int64
	if err := database.DB.Model(&ProgramPhase{}).Where("program_id = ?", programID).Count(&phaseCount).Error; err != nil {
		return 0, 0, err
	}
	var actCount int64
	err := database.DB.Model(&Activity{}).
		Joins("JOIN program_phases ph ON ph.id = activities.phase_id").
		Where("ph.program_id = ?", programID).
		Count(&actCount).Error
	return int(phaseCount), int(actCount), err
}

func batchCountPhasesAndActivities(programIDs []string) (map[string][2]int, error) {
	if len(programIDs) == 0 {
		return map[string][2]int{}, nil
	}
	result := make(map[string][2]int, len(programIDs))

	var phaseCounts []struct {
		ProgramID string
		Count     int
	}
	if err := database.DB.Model(&ProgramPhase{}).
		Select("program_id, COUNT(*) AS count").
		Where("program_id IN ?", programIDs).
		Group("program_id").
		Scan(&phaseCounts).Error; err != nil {
		return nil, err
	}
	for _, r := range phaseCounts {
		v := result[r.ProgramID]
		v[0] = r.Count
		result[r.ProgramID] = v
	}

	var actCounts []struct {
		ProgramID string
		Count     int
	}
	if err := database.DB.Model(&Activity{}).
		Select("ph.program_id AS program_id, COUNT(*) AS count").
		Joins("JOIN program_phases ph ON ph.id = activities.phase_id").
		Where("ph.program_id IN ?", programIDs).
		Group("ph.program_id").
		Scan(&actCounts).Error; err != nil {
		return nil, err
	}
	for _, r := range actCounts {
		v := result[r.ProgramID]
		v[1] = r.Count
		result[r.ProgramID] = v
	}

	return result, nil
}

// batchEnrollmentStats returns enrolled count and average completion % per program.
// completion_percent comes from enrollments; if the column doesn't exist yet it gracefully returns zeros.
func batchEnrollmentStats(programIDs []string) (map[string][2]int, error) {
	result := make(map[string][2]int, len(programIDs))
	if len(programIDs) == 0 {
		return result, nil
	}
	// Build placeholder list for IN clause — GORM handles []string correctly with IN
	var rows []struct {
		ProgramID     string
		EnrolledCount int
		AvgCompletion float64
	}
	err := database.DB.Raw(`
		SELECT c.program_id::text                                              AS program_id,
		       COUNT(e.id)                                                      AS enrolled_count,
		       COALESCE(AVG(CASE WHEN e.status IN ('enrolled','completed') THEN e.completion_percent END), 0) AS avg_completion
		FROM cohorts c
		JOIN enrollments e ON e.cohort_id = c.id
		WHERE c.program_id::text IN ?
		  AND e.status IN ('invited','enrolled','completed')
		GROUP BY c.program_id
	`, programIDs).Scan(&rows).Error
	if err != nil {
		return result, nil // non-fatal: card shows 0
	}
	for _, r := range rows {
		result[r.ProgramID] = [2]int{r.EnrolledCount, int(r.AvgCompletion)}
	}
	return result, nil
}

// ── Phases ────────────────────────────────────────────────────────

func getPhaseByID(id string) (*ProgramPhase, error) {
	var ph ProgramPhase
	err := database.DB.Where("id = ?", id).First(&ph).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &ph, err
}

func createPhase(ph *ProgramPhase) error {
	return database.DB.Create(ph).Error
}

func savePhase(ph *ProgramPhase) error {
	return database.DB.Save(ph).Error
}

func deletePhase(id string) error {
	return database.DB.Where("id = ?", id).Delete(&ProgramPhase{}).Error
}

func reorderPhases(programID string, orderedIDs []string) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		for i, id := range orderedIDs {
			if err := tx.Model(&ProgramPhase{}).
				Where("id = ? AND program_id = ?", id, programID).
				Update("phase_number", i).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ── Modules ───────────────────────────────────────────────────────

func getModuleByID(id string) (*ProgramModule, error) {
	var m ProgramModule
	err := database.DB.Where("id = ?", id).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &m, err
}

func nextModuleSortOrder(phaseID string) (int, error) {
	var count int64
	err := database.DB.Model(&ProgramModule{}).Where("phase_id = ?", phaseID).Count(&count).Error
	return int(count), err
}

func createModule(m *ProgramModule) error {
	return database.DB.Create(m).Error
}

func saveModule(m *ProgramModule) error {
	return database.DB.Save(m).Error
}

func deleteModule(id string) error {
	return database.DB.Where("id = ?", id).Delete(&ProgramModule{}).Error
}

// ── Activities ────────────────────────────────────────────────────

func getActivityByID(id string) (*Activity, error) {
	var a Activity
	err := database.DB.Where("id = ?", id).First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &a, err
}

func createActivity(a *Activity) error {
	return database.DB.Create(a).Error
}

func saveActivity(a *Activity) error {
	return database.DB.Save(a).Error
}

func deleteActivity(id string) error {
	return database.DB.Where("id = ?", id).Delete(&Activity{}).Error
}

func nextActivitySortOrder(phaseID string) (int, error) {
	var count int64
	err := database.DB.Model(&Activity{}).Where("phase_id = ?", phaseID).Count(&count).Error
	return int(count), err
}

// ── Activity Faculty ──────────────────────────────────────────────

type activityFacultyRow struct {
	ID            string
	ActivityID    string
	FacultyUserID string
	CohortID      string
	CohortName    string
	Name          string
	Email         string
	AvatarURL     string
	Role          string
	OverrideNote  *string
}

func listActivityFaculty(activityID string) ([]activityFacultyRow, error) {
	var rows []activityFacultyRow
	err := database.DB.Raw(`
		SELECT
			af.id, af.activity_id, af.faculty_user_id,
			COALESCE(af.cohort_id::TEXT,'') AS cohort_id,
			COALESCE(co.name,'')             AS cohort_name,
			u.name, u.email, COALESCE(u.avatar_url,'') AS avatar_url,
			af.role, af.override_note
		FROM activity_faculty af
		JOIN users u ON u.id = af.faculty_user_id
		LEFT JOIN cohorts co ON co.id = af.cohort_id
		WHERE af.activity_id = ?
		ORDER BY af.created_at ASC
	`, activityID).Scan(&rows).Error
	return rows, err
}

func listActivitiesFacultyBulk(activityIDs []string) ([]activityFacultyRow, error) {
	if len(activityIDs) == 0 {
		return nil, nil
	}
	var rows []activityFacultyRow
	err := database.DB.Raw(`
		SELECT
			af.id, af.activity_id, af.faculty_user_id,
			COALESCE(af.cohort_id::TEXT,'') AS cohort_id,
			COALESCE(co.name,'')             AS cohort_name,
			u.name, u.email, COALESCE(u.avatar_url,'') AS avatar_url,
			af.role, af.override_note
		FROM activity_faculty af
		JOIN users u ON u.id = af.faculty_user_id
		LEFT JOIN cohorts co ON co.id = af.cohort_id
		WHERE af.activity_id = ANY(ARRAY[?]::uuid[])
		ORDER BY af.activity_id, af.created_at ASC
	`, activityIDs).Scan(&rows).Error
	return rows, err
}

func assignFaculty(af *ActivityFaculty) error {
	return database.DB.Create(af).Error
}

func removeFaculty(activityID, facultyUserID string) error {
	return database.DB.
		Where("activity_id = ? AND faculty_user_id = ?", activityID, facultyUserID).
		Delete(&ActivityFaculty{}).Error
}

func getAssignment(activityID, facultyUserID string) (*ActivityFaculty, error) {
	var af ActivityFaculty
	err := database.DB.
		Where("activity_id = ? AND faculty_user_id = ?", activityID, facultyUserID).
		First(&af).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &af, err
}

// conflictRow represents another session the faculty is already booked for.
type conflictRow struct {
	ActivityID    string
	ActivityTitle string
	ProgramTitle  string
	CohortName    string
	StartDate     string
	EndDate       string
	Role          string
}

// checkFacultyConflicts finds other live_session/coaching activities the faculty is assigned to
// that overlap in real calendar dates with the target activity (resolved via cohort start_date).
func checkFacultyConflicts(facultyUserID, targetActivityID string) ([]conflictRow, error) {
	var rows []conflictRow
	err := database.DB.Raw(`
		SELECT
			a.id                  AS activity_id,
			a.title               AS activity_title,
			p.title               AS program_title,
			COALESCE(co.name,'')  AS cohort_name,
			(co.start_date + (a.start_day - 1) * INTERVAL '1 day')::DATE::TEXT  AS start_date,
			(co.start_date + (a.start_day + a.duration_days - 2) * INTERVAL '1 day')::DATE::TEXT AS end_date,
			af2.role              AS role
		FROM activity_faculty af2
		JOIN activities a         ON a.id = af2.activity_id
		JOIN program_phases ph    ON ph.id = a.phase_id
		JOIN programs p           ON p.id = ph.program_id
		-- get the earliest active cohort for this program to resolve real dates
		LEFT JOIN cohorts co ON co.program_id = p.id AND co.start_date IS NOT NULL
		-- join target activity to get its date range
		JOIN activities ta        ON ta.id = ?
		JOIN program_phases tph   ON tph.id = ta.phase_id
		JOIN programs tp          ON tp.id = tph.program_id
		LEFT JOIN cohorts tco     ON tco.program_id = tp.id AND tco.start_date IS NOT NULL
		WHERE af2.faculty_user_id = ?
		  AND af2.activity_id     != ?
		  AND a.type IN ('live_session','coaching')
		  AND co.start_date IS NOT NULL
		  AND tco.start_date IS NOT NULL
		  -- overlap: [s1,e1] overlaps [s2,e2] when s1<=e2 AND s2<=e1
		  AND (co.start_date + (a.start_day - 1) * INTERVAL '1 day') <=
		      (tco.start_date + (ta.start_day + ta.duration_days - 2) * INTERVAL '1 day')
		  AND (tco.start_date + (ta.start_day - 1) * INTERVAL '1 day') <=
		      (co.start_date + (a.start_day + a.duration_days - 2) * INTERVAL '1 day')
		ORDER BY start_date ASC
		LIMIT 20
	`, targetActivityID, facultyUserID, targetActivityID).Scan(&rows).Error
	return rows, err
}

// listFacultySchedule returns all sessions assigned to a faculty member as calendar days.
type facultyScheduleRow struct {
	Date          string
	ActivityID    string
	ActivityTitle string
	ProgramTitle  string
	Role          string
}

func listFacultySchedule(facultyUserID string) ([]facultyScheduleRow, error) {
	var rows []facultyScheduleRow
	// Use cohort start_date if available, else fall back to program start_date, else TODAY.
	// This ensures assignments always appear in the calendar regardless of scheduling state.
	err := database.DB.Raw(`
		SELECT
			generate_series(
				(COALESCE(co.start_date, p.start_date, CURRENT_DATE) + (a.start_day - 1) * INTERVAL '1 day')::DATE,
				(COALESCE(co.start_date, p.start_date, CURRENT_DATE) + (a.start_day + a.duration_days - 2) * INTERVAL '1 day')::DATE,
				'1 day'
			)::DATE::TEXT           AS date,
			a.id                    AS activity_id,
			a.title                 AS activity_title,
			p.title                 AS program_title,
			af.role                 AS role
		FROM activity_faculty af
		JOIN activities a         ON a.id = af.activity_id
		JOIN program_phases ph    ON ph.id = a.phase_id
		JOIN programs p           ON p.id = ph.program_id
		LEFT JOIN cohorts co      ON co.program_id = p.id AND co.start_date IS NOT NULL
		WHERE af.faculty_user_id = ?
		ORDER BY date ASC
	`, facultyUserID).Scan(&rows).Error
	return rows, err
}

// listFacultyAssignments returns all activities + programs a faculty member is assigned to.
type facultyAssignmentRow struct {
	ActivityID    string
	ActivityTitle string
	ActivityType  string
	PhaseName     string
	ProgramID     string
	ProgramTitle  string
	ProgramColor  string
	CohortID      string
	CohortName    string
	Role          string
	StartDay      int
	DurationDays  int
}

func listFacultyAssignments(facultyUserID string) ([]facultyAssignmentRow, error) {
	var rows []facultyAssignmentRow
	err := database.DB.Raw(`
		SELECT
			a.id                             AS activity_id,
			a.title                          AS activity_title,
			a.type                           AS activity_type,
			ph.title                         AS phase_name,
			p.id                             AS program_id,
			p.title                          AS program_title,
			p.color                          AS program_color,
			COALESCE(af.cohort_id::TEXT,'')  AS cohort_id,
			COALESCE(co.name,'')             AS cohort_name,
			af.role                          AS role,
			a.start_day                      AS start_day,
			a.duration_days                  AS duration_days
		FROM activity_faculty af
		JOIN activities a      ON a.id = af.activity_id
		JOIN program_phases ph ON ph.id = a.phase_id
		JOIN programs p        ON p.id = ph.program_id
		LEFT JOIN cohorts co   ON co.id = af.cohort_id
		WHERE af.faculty_user_id = ?
		ORDER BY p.title ASC, ph.phase_number ASC, a.start_day ASC
	`, facultyUserID).Scan(&rows).Error
	return rows, err
}

// listOrgFaculty returns all users with role=faculty in an org.
type orgFacultyRow struct {
	ID               string
	Name             string
	Email            string
	AvatarURL        string
	Specialization   string
	Bio              string
	Phone            string
	Location         string
	LinkedinURL      string
	Certifications   string // comma-separated, split in service
	OnboardingStatus string
}

func listOrgFaculty(orgID string) ([]orgFacultyRow, error) {
	var rows []orgFacultyRow
	err := database.DB.Raw(`
		SELECT u.id, u.name, u.email,
		       COALESCE(u.avatar_url,'')          AS avatar_url,
		       COALESCE(u.specialization,'')       AS specialization,
		       COALESCE(u.bio,'')                  AS bio,
		       COALESCE(u.phone,'')                AS phone,
		       COALESCE(u.location,'')             AS location,
		       COALESCE(u.linkedin_url,'')         AS linkedin_url,
		       COALESCE(array_to_string(u.certifications,','),'') AS certifications,
		       COALESCE(u.onboarding_status,'active') AS onboarding_status
		FROM users u
		JOIN org_members om ON om.user_id = u.id AND om.org_id = ?
		WHERE u.role = 'faculty'
		ORDER BY u.name ASC
	`, orgID).Scan(&rows).Error
	return rows, err
}

type facultyStatsRow struct {
	FacultyID     string
	Sessions      int
	Scheduled     int
	EngagementPct int
}

// getFacultySessionStats returns delivered + upcoming session counts per faculty in an org.
func getFacultySessionStats(orgID string) (map[string]facultyStatsRow, error) {
	var rows []struct {
		FacultyID string
		Sessions  int
		Scheduled int
	}
	err := database.DB.Raw(`
		SELECT cs.faculty_id::text AS faculty_id,
		       COUNT(CASE WHEN cs.status = 'completed' THEN 1 END) AS sessions,
		       COUNT(CASE WHEN cs.status = 'scheduled' THEN 1 END) AS scheduled
		FROM class_sessions cs
		JOIN programs p ON p.id = cs.program_id AND p.org_id = ?
		GROUP BY cs.faculty_id
	`, orgID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make(map[string]facultyStatsRow, len(rows))
	for _, r := range rows {
		result[r.FacultyID] = facultyStatsRow{
			FacultyID: r.FacultyID,
			Sessions:  r.Sessions,
			Scheduled: r.Scheduled,
		}
	}
	return result, nil
}

type facultyL1Row struct {
	FacultyID string
	AvgScore  float64
	TotalResp int
}

func getFacultyL1Scores(orgID string) (map[string]facultyL1Row, error) {
	var rows []struct {
		FacultyUserID string
		AvgScore      float64
		TotalResp     int
	}
	err := database.DB.Raw(`
		SELECT fl.faculty_user_id::text AS faculty_user_id,
		       AVG(fl.avg_score)        AS avg_score,
		       SUM(fl.response_count)   AS total_resp
		FROM faculty_l1_scores fl
		JOIN programs p ON p.id = fl.program_id AND p.org_id = ?
		GROUP BY fl.faculty_user_id
	`, orgID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make(map[string]facultyL1Row, len(rows))
	for _, r := range rows {
		result[r.FacultyUserID] = facultyL1Row{
			FacultyID: r.FacultyUserID,
			AvgScore:  r.AvgScore,
			TotalResp: r.TotalResp,
		}
	}
	return result, nil
}

type facultyL2L3L4Row struct {
	FacultyID string
	AvgL2     float64
	AvgL3     float64
	AvgL4     float64
	L2Resp    int
	L3Resp    int
	L4Resp    int
}

func getFacultyL2L3L4Scores(orgID string) (map[string]facultyL2L3L4Row, error) {
	result := make(map[string]facultyL2L3L4Row)

	var l2rows []struct {
		FacultyUserID string
		AvgDelta      float64
		TotalResp     int
	}
	if err := database.DB.Raw(`
		SELECT fl.faculty_user_id::text AS faculty_user_id,
		       AVG(fl.delta_pct)        AS avg_delta,
		       SUM(fl.response_count)   AS total_resp
		FROM faculty_l2_scores fl
		JOIN programs p ON p.id = fl.program_id AND p.org_id = ?
		GROUP BY fl.faculty_user_id
	`, orgID).Scan(&l2rows).Error; err == nil {
		for _, r := range l2rows {
			v := result[r.FacultyUserID]
			v.FacultyID = r.FacultyUserID
			v.AvgL2 = r.AvgDelta
			v.L2Resp = r.TotalResp
			result[r.FacultyUserID] = v
		}
	}

	var l3rows []struct {
		FacultyUserID string
		AvgBehavior   float64
		TotalResp     int
	}
	if err := database.DB.Raw(`
		SELECT fl.faculty_user_id::text AS faculty_user_id,
		       AVG(fl.behavior_pct)     AS avg_behavior,
		       SUM(fl.response_count)   AS total_resp
		FROM faculty_l3_scores fl
		JOIN programs p ON p.id = fl.program_id AND p.org_id = ?
		GROUP BY fl.faculty_user_id
	`, orgID).Scan(&l3rows).Error; err == nil {
		for _, r := range l3rows {
			v := result[r.FacultyUserID]
			v.FacultyID = r.FacultyUserID
			v.AvgL3 = r.AvgBehavior
			v.L3Resp = r.TotalResp
			result[r.FacultyUserID] = v
		}
	}

	var l4rows []struct {
		FacultyUserID string
		AvgResults    float64
		TotalResp     int
	}
	if err := database.DB.Raw(`
		SELECT fl.faculty_user_id::text AS faculty_user_id,
		       AVG(fl.results_pct)      AS avg_results,
		       SUM(fl.response_count)   AS total_resp
		FROM faculty_l4_scores fl
		JOIN programs p ON p.id = fl.program_id AND p.org_id = ?
		GROUP BY fl.faculty_user_id
	`, orgID).Scan(&l4rows).Error; err == nil {
		for _, r := range l4rows {
			v := result[r.FacultyUserID]
			v.FacultyID = r.FacultyUserID
			v.AvgL4 = r.AvgResults
			v.L4Resp = r.TotalResp
			result[r.FacultyUserID] = v
		}
	}

	return result, nil
}

func updateFacultyProfile(userID string, req UpdateFacultyProfileRequest) error {
	updates := map[string]interface{}{}
	if req.Specialization != nil {
		updates["specialization"] = *req.Specialization
	}
	if req.Bio != nil {
		updates["bio"] = *req.Bio
	}
	if req.Phone != nil {
		updates["phone"] = *req.Phone
	}
	if req.Location != nil {
		updates["location"] = *req.Location
	}
	if req.LinkedinURL != nil {
		updates["linkedin_url"] = *req.LinkedinURL
	}
	if req.Certifications != nil {
		updates["certifications"] = req.Certifications
	}
	if req.OnboardingStatus != nil {
		updates["onboarding_status"] = *req.OnboardingStatus
	}
	if len(updates) == 0 {
		return nil
	}
	return database.DB.Exec(`
		UPDATE users SET `+buildSetClause(updates)+` WHERE id = ?`,
		append(mapValues(updates), userID)...,
	).Error
}

func buildSetClause(m map[string]interface{}) string {
	parts := make([]string, 0, len(m))
	for k := range m {
		parts = append(parts, k+" = ?")
	}
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += ", "
		}
		out += p
	}
	return out
}

func mapValues(m map[string]interface{}) []interface{} {
	vals := make([]interface{}, 0, len(m))
	for _, v := range m {
		vals = append(vals, v)
	}
	return vals
}

// getFacultyProgramLinks returns program_id → program_title for a faculty member.
func getFacultyProgramLinks(facultyID string) ([]string, []string, error) {
	var rows []struct {
		ProgramID    string
		ProgramTitle string
	}
	err := database.DB.Raw(`
		SELECT DISTINCT p.id::text AS program_id, p.title AS program_title
		FROM programs p
		JOIN program_phases ph ON ph.program_id = p.id
		JOIN activities a ON a.phase_id = ph.id
		JOIN activity_faculty af ON af.activity_id = a.id AND af.faculty_user_id = ?::uuid
		ORDER BY p.title ASC
	`, facultyID).Scan(&rows).Error
	if err != nil {
		return nil, nil, err
	}
	ids := make([]string, 0, len(rows))
	titles := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ProgramID)
		titles = append(titles, r.ProgramTitle)
	}
	return ids, titles, nil
}

// ── Program Materials ─────────────────────────────────────────────

func listProgramMaterials(programID string) ([]ProgramMaterial, error) {
	var mats []ProgramMaterial
	err := database.DB.
		Where("program_id = ?", programID).
		Order("created_at desc").
		Find(&mats).Error
	return mats, err
}

func createProgramMaterial(m *ProgramMaterial) error {
	return database.DB.Create(m).Error
}

func deleteProgramMaterial(id, programID string) error {
	return database.DB.
		Where("id = ? AND program_id = ?", id, programID).
		Delete(&ProgramMaterial{}).Error
}

// ── Session Scheduling ────────────────────────────────────────────────────────

// sessionRow is a lightweight scan target for class_sessions joined with faculty name.
type sessionRow struct {
	ID           string  `gorm:"column:id"`
	ActivityID   string  `gorm:"column:activity_id"`
	ProgramID    string  `gorm:"column:program_id"`
	CohortID     string  `gorm:"column:cohort_id"`
	FacultyID    string  `gorm:"column:faculty_id"`
	FacultyName  string  `gorm:"column:faculty_name"`
	Title        string  `gorm:"column:title"`
	Description  *string `gorm:"column:description"`
	SessionType  string  `gorm:"column:session_type"`
	VirtualLink  *string `gorm:"column:virtual_link"`
	ScheduledAt  string  `gorm:"column:scheduled_at"`
	DurationMins int     `gorm:"column:duration_mins"`
	Status       string  `gorm:"column:status"`
	CreatedAt    string  `gorm:"column:created_at"`
}

// createScheduledSession inserts a class_sessions row.
// Returns the canonical scannable fields as a sessionRow.
func createScheduledSession(
	activityID, programID uuid.UUID, cohortID *uuid.UUID, facultyID uuid.UUID,
	title string, desc *string, sessionType string, link *string,
	scheduledAt time.Time, durationMins int,
) (*sessionRow, error) {
	id := uuid.New()
	now := time.Now()
	err := database.DB.Exec(`
		INSERT INTO class_sessions
		  (id, activity_id, program_id, cohort_id, faculty_id, title, description, session_type, virtual_link, scheduled_at, duration_mins, status, agenda, created_at, updated_at)
		VALUES
		  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', '[]', ?, ?)
	`, id, activityID, programID, cohortID, facultyID, title, desc, sessionType, link, scheduledAt, durationMins, now, now).Error
	if err != nil {
		return nil, err
	}
	var r sessionRow
	database.DB.Raw(`
		SELECT cs.id::text, COALESCE(cs.activity_id::text,'') AS activity_id,
		  cs.program_id::text, COALESCE(cs.cohort_id::text,'') AS cohort_id, cs.faculty_id::text,
		  COALESCE(u.name,'') AS faculty_name,
		  cs.title, cs.description, cs.session_type, cs.virtual_link,
		  cs.scheduled_at::text, cs.duration_mins, cs.status, cs.created_at::text
		FROM class_sessions cs
		LEFT JOIN users u ON u.id = cs.faculty_id
		WHERE cs.id = ?
	`, id).Scan(&r)
	return &r, nil
}

func listSessionsByActivity(activityID string) ([]sessionRow, error) {
	var rows []sessionRow
	err := database.DB.Raw(`
		SELECT cs.id::text, COALESCE(cs.activity_id::text,'') AS activity_id,
		  cs.program_id::text, COALESCE(cs.cohort_id::text,'') AS cohort_id, cs.faculty_id::text,
		  COALESCE(u.name,'') AS faculty_name,
		  cs.title, cs.description, cs.session_type, cs.virtual_link,
		  cs.scheduled_at::text, cs.duration_mins, cs.status, cs.created_at::text
		FROM class_sessions cs
		LEFT JOIN users u ON u.id = cs.faculty_id
		WHERE cs.activity_id = ?
		ORDER BY cs.scheduled_at ASC
	`, activityID).Scan(&rows).Error
	return rows, err
}
