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
		Preload("Phases.Activities", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order asc")
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
				ProgramID:   newProg.ID,
				Title:       ph.Title,
				Description: ph.Description,
				PhaseNumber: ph.PhaseNumber,
				WeekLabel:   ph.WeekLabel,
				Color:       ph.Color,
			}
			if err := tx.Create(&newPhase).Error; err != nil {
				return err
			}
			for _, act := range ph.Activities {
				newAct := Activity{
					PhaseID:      newPhase.ID,
					Title:        act.Title,
					Description:  act.Description,
					Type:         act.Type,
					DeliveryMode: act.DeliveryMode,
					SortOrder:    act.SortOrder,
					DurationMins: act.DurationMins,
					DueDayOffset: act.DueDayOffset,
					IsMandatory:  act.IsMandatory,
					ConfigJSON:   act.ConfigJSON,
				}
				if err := tx.Create(&newAct).Error; err != nil {
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
			u.name, u.email, COALESCE(u.avatar_url,'') AS avatar_url,
			af.role, af.override_note
		FROM activity_faculty af
		JOIN users u ON u.id = af.faculty_user_id
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
			u.name, u.email, COALESCE(u.avatar_url,'') AS avatar_url,
			af.role, af.override_note
		FROM activity_faculty af
		JOIN users u ON u.id = af.faculty_user_id
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
	Date         string
	ActivityID   string
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
	Role          string
	StartDay      int
	DurationDays  int
}

func listFacultyAssignments(facultyUserID string) ([]facultyAssignmentRow, error) {
	var rows []facultyAssignmentRow
	err := database.DB.Raw(`
		SELECT
			a.id            AS activity_id,
			a.title         AS activity_title,
			a.type          AS activity_type,
			ph.title        AS phase_name,
			p.id            AS program_id,
			p.title         AS program_title,
			p.color         AS program_color,
			af.role         AS role,
			a.start_day     AS start_day,
			a.duration_days AS duration_days
		FROM activity_faculty af
		JOIN activities a      ON a.id = af.activity_id
		JOIN program_phases ph ON ph.id = a.phase_id
		JOIN programs p        ON p.id = ph.program_id
		WHERE af.faculty_user_id = ?
		ORDER BY p.title ASC, ph.phase_number ASC, a.start_day ASC
	`, facultyUserID).Scan(&rows).Error
	return rows, err
}

// listOrgFaculty returns all users with role=faculty in an org.
type orgFacultyRow struct {
	ID        string
	Name      string
	Email     string
	AvatarURL string
}

func listOrgFaculty(orgID string) ([]orgFacultyRow, error) {
	var rows []orgFacultyRow
	err := database.DB.Raw(`
		SELECT u.id, u.name, u.email, COALESCE(u.avatar_url,'') AS avatar_url
		FROM users u
		JOIN org_members om ON om.user_id = u.id AND om.org_id = ?
		WHERE u.role = 'faculty'
		ORDER BY u.name ASC
	`, orgID).Scan(&rows).Error
	return rows, err
}
