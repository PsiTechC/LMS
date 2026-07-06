package main

import (
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"github.com/xa-lms/api/internal/activityprogress"
	"github.com/xa-lms/api/internal/analytics"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/auth"
	"github.com/xa-lms/api/internal/coaching"
	"github.com/xa-lms/api/internal/cohorts"
	"github.com/xa-lms/api/internal/communications"
	"github.com/xa-lms/api/internal/competencies"
	"github.com/xa-lms/api/internal/compliance"
	"github.com/xa-lms/api/internal/content"
	"github.com/xa-lms/api/internal/discussions"
	"github.com/xa-lms/api/internal/faculty_management"
	"github.com/xa-lms/api/internal/feedback360"
	"github.com/xa-lms/api/internal/invitations"
	"github.com/xa-lms/api/internal/leaderboard"
	"github.com/xa-lms/api/internal/organizations"
	"github.com/xa-lms/api/internal/programs"
	"github.com/xa-lms/api/internal/roles"
	"github.com/xa-lms/api/internal/sessions"
	sharedmw "github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/internal/submissions"
	"github.com/xa-lms/api/internal/surveys"
	"github.com/xa-lms/api/internal/systemhealth"
	"github.com/xa-lms/api/internal/users"
	"github.com/xa-lms/api/pkg/cache"
	"github.com/xa-lms/api/pkg/database"
	"github.com/xa-lms/api/pkg/seed"
)

// allowedExtensions is the whitelist for content library uploads.
var allowedExtensions = map[string]bool{
	".pdf": true, ".ppt": true, ".pptx": true,
	".mp4": true, ".mov": true, ".avi": true, ".mkv": true,
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
	".zip": true, ".docx": true, ".xlsx": true,
	".md": true, ".html": true, ".txt": true,
}

// extToMIME maps file extension → MIME type for Content-Type headers.
var extToMIME = map[string]string{
	".pdf":  "application/pdf",
	".ppt":  "application/vnd.ms-powerpoint",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".mp4":  "video/mp4",
	".mov":  "video/quicktime",
	".avi":  "video/x-msvideo",
	".mkv":  "video/x-matroska",
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".gif":  "image/gif",
	".zip":  "application/zip",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".md":   "text/markdown",
	".html": "text/html",
	".txt":  "text/plain",
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// ── Database ─────────────────────────────────────────────────────────────
	if _, err := database.Connect(); err != nil {
		log.Fatalf("❌ Database connection failed: %v", err)
	}

	// ── Cache (Redis) ────────────────────────────────────────────────────────
	cache.Init()
	log.Println("✅ Cache (Redis) initialised")

	// ── Seed ──────────────────────────────────────────────────────────────────
	// Seeding is idempotent bootstrap data. A transient DB blip here must NOT
	// crash the server (that would turn a brief network hiccup into a crash
	// loop) — log and continue; the seed runs again on the next boot.
	if err := seed.SuperAdmin(); err != nil {
		log.Printf("⚠️  Seed (superadmin) skipped: %v", err)
	}
	// Default "XA-LMS" org — home for org-wide coaches and marketplace enrollments.
	if _, err := seed.DefaultOrg(); err != nil {
		log.Printf("⚠️  Seed (default org) skipped: %v", err)
	}
	if err := seed.DevUsers(); err != nil {
		log.Printf("⚠️  Seed (dev users) skipped: %v", err)
	}

	// ── Upload directory (legacy — no longer used for storage, kept for compatibility) ─
	uploadsDir, _ := filepath.Abs(func() string {
		if d := os.Getenv("UPLOAD_DIR"); d != "" {
			return d
		}
		return "./uploads"
	}())
	_ = os.MkdirAll(uploadsDir, 0o750)

	// ── Echo ──────────────────────────────────────────────────────────────────
	e := echo.New()
	e.HideBanner = true

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	allowedOrigins := []string{"http://localhost:3000"}
	if extra := os.Getenv("WEB_ORIGIN"); extra != "" {
		allowedOrigins = append(allowedOrigins, extra)
	}
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:     allowedOrigins,
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Disposition", "Content-Type", "Content-Length"},
		AllowCredentials: true,
	}))
	e.Use(middleware.RequestID())

	// NOTE: e.Static("/uploads", ...) was intentionally removed.
	// Direct disk access is now blocked; files are served only through
	// /api/v1/uploads/:id/preview and /api/v1/uploads/:id/download
	// which enforce JWT authentication on every request.

	// ── Health ────────────────────────────────────────────────────────────────
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(200, map[string]string{
			"status":  "ok",
			"service": "xa-lms-api",
			"env":     os.Getenv("APP_ENV"),
		})
	})

	// ── API v1 ────────────────────────────────────────────────────────────────
	// Request-timing middleware feeds the System Health collector (5-min buckets).
	systemhealth.StartCollector()
	v1 := e.Group("/api/v1", systemhealth.Middleware())

	auth.NewHandler().Register(v1)
	organizations.NewHandler().Register(v1)
	users.NewHandler().Register(v1)
	audit.NewHandler().Register(v1)
	programs.NewHandler().Register(v1)
	programs.InitSchema()
	cohorts.NewHandler().Register(v1)
	invitations.NewHandler().Register(v1)
	sessions.NewHandler().Register(v1)
	submissions.NewHandler().Register(v1)
	coaching.NewHandler().Register(v1)
	if err := coaching.InitSchema(); err != nil {
		log.Fatalf("coaching schema failed: %v", err)
	}
	competencies.NewHandler().Register(v1)
	analytics.NewHandler().Register(v1)
	discussions.NewHandler().Register(v1)
	surveys.NewHandler().Register(v1)
	surveys.InitSchema()
	systemhealth.NewHandler().Register(v1)
	leaderboard.NewHandler().Register(v1)
	leaderboard.InitSchema()
	communications.NewHandler().Register(v1)
	go communications.StartRuleEvaluator()
	compliance.NewHandler().Register(v1)
	content.NewHandler().Register(v1)
	content.InitSchema()
	activityprogress.NewHandler().Register(v1)
	roles.NewHandler().Register(v1)
	faculty_management.NewHandler().Register(v1)
	feedback360.NewHandler().Register(v1)
	feedback360.InitSchema()

	// ── file_uploads table — stores file bytes directly in PostgreSQL BYTEA ─────
	sqlDB, _ := database.DB.DB()
	if _, err := sqlDB.Exec(`
		CREATE TABLE IF NOT EXISTS file_uploads (
		    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
		    original_name VARCHAR(500) NOT NULL,
		    content_type  VARCHAR(200) NOT NULL,
		    size_bytes    BIGINT       NOT NULL,
		    file_data     BYTEA        NOT NULL,
		    uploaded_by   UUID         NOT NULL REFERENCES users(id) ON DELETE SET NULL,
		    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_file_uploads_uploaded_by ON file_uploads(uploaded_by);
	`); err != nil {
		log.Fatalf("❌ file_uploads schema failed: %v", err)
	}
	// Migrate existing file_uploads table: add file_data, drop file_key NOT NULL
	migrationSteps := []string{
		// Add file_data column if missing
		`DO $$ BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'file_uploads' AND column_name = 'file_data'
			) THEN
				ALTER TABLE file_uploads ADD COLUMN file_data BYTEA;
			END IF;
		END $$`,
		// Drop NOT NULL on file_key if it still exists (old schema had it NOT NULL)
		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'file_uploads' AND column_name = 'file_key'
				  AND is_nullable = 'NO'
			) THEN
				ALTER TABLE file_uploads ALTER COLUMN file_key DROP NOT NULL;
			END IF;
		END $$`,
	}
	for _, s := range migrationSteps {
		if _, err := sqlDB.Exec(s); err != nil {
			log.Printf("file_uploads migration warn: %v", err)
		}
	}
	log.Println("✅ file_uploads schema ready")

	// ── class_sessions.cohort_id — make nullable so sessions can be program-level ─
	if _, err := sqlDB.Exec(`
		DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'class_sessions' AND column_name = 'cohort_id'
				  AND is_nullable = 'NO'
			) THEN
				ALTER TABLE class_sessions ALTER COLUMN cohort_id DROP NOT NULL;
			END IF;
		END $$
	`); err != nil {
		log.Printf("class_sessions cohort_id migration warn: %v", err)
	}

	// ── invitations.cohort_id — make nullable so org-level faculty invites ─────
	// (no cohort) can be stored as NULL instead of a nil-UUID sentinel that
	// violates the FK to cohorts(id). See invitations.sendOrgFacultyInviteService.
	if _, err := sqlDB.Exec(`
		DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'invitations' AND column_name = 'cohort_id'
				  AND is_nullable = 'NO'
			) THEN
				ALTER TABLE invitations ALTER COLUMN cohort_id DROP NOT NULL;
			END IF;
		END $$
	`); err != nil {
		log.Printf("invitations cohort_id migration warn: %v", err)
	}
	// Clean up any legacy rows that carried the nil-UUID sentinel.
	if _, err := sqlDB.Exec(`
		UPDATE invitations SET cohort_id = NULL
		WHERE cohort_id = '00000000-0000-0000-0000-000000000000'
	`); err != nil {
		log.Printf("invitations sentinel cleanup warn: %v", err)
	}
	log.Println("invitations.cohort_id nullable")
	log.Println("✅ class_sessions.cohort_id nullable")

	// ── Extra role personas beyond the base 4 ──────────────────────────────────
	//   coach                — delivers coaching engagements (see coaches table).
	//   participant_retailer — a Participant variant with a restricted workspace
	//                          (only Assessments / 360° / Coaching unlocked).
	//   superadmin_secondary — a Super Admin variant that cannot access Billing,
	//                          System Health, Integrations, or the Audit Log.
	// ALTER TYPE ... ADD VALUE IF NOT EXISTS is idempotent and safe to re-run.
	for _, enumType := range []string{"user_role", "org_member_role"} {
		for _, val := range []string{"coach", "participant_retailer", "superadmin_secondary"} {
			if _, err := sqlDB.Exec(`ALTER TYPE ` + enumType + ` ADD VALUE IF NOT EXISTS '` + val + `'`); err != nil {
				log.Printf("%s add '%s' value warn: %v", enumType, val, err)
			}
		}
	}
	// coaches table — one row per user who can act as a coach in an org. Created
	// when a user is enrolled/accepts as a coach. user_id is unique per org so a
	// person is a coach at most once per org (a faculty flagged as coach lives here too).
	if _, err := sqlDB.Exec(`
		CREATE TABLE IF NOT EXISTS coaches (
			id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
			user_id    UUID        NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
			org_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (org_id, user_id)
		);
		CREATE INDEX IF NOT EXISTS idx_coaches_org_id  ON coaches (org_id);
		CREATE INDEX IF NOT EXISTS idx_coaches_user_id ON coaches (user_id);
	`); err != nil {
		log.Fatalf("❌ coaches schema failed: %v", err)
	}
	// ── coaches.program_id — scope a coach to a specific program (NULL = org-wide). ──
	// A Superadmin can enroll a coach into a specific program or leave them org-wide;
	// a Business Admin's coaches are auto-scoped to the program they manage. We relax
	// the (org_id, user_id) uniqueness to (org_id, user_id, program_id) so the same
	// person can be a coach org-wide AND on individual programs. NULLs are treated as
	// distinct by Postgres, so a partial unique index guards the org-wide row.
	coachProgramSteps := []string{
		`ALTER TABLE coaches ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE CASCADE`,
		`ALTER TABLE coaches DROP CONSTRAINT IF EXISTS coaches_org_id_user_id_key`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_coaches_org_user_program
			ON coaches (org_id, user_id, program_id)
			WHERE program_id IS NOT NULL`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_coaches_org_user_orgwide
			ON coaches (org_id, user_id)
			WHERE program_id IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_coaches_program_id ON coaches (program_id)`,
	}
	for _, s := range coachProgramSteps {
		if _, err := sqlDB.Exec(s); err != nil {
			log.Printf("coaches program_id migration warn: %v", err)
		}
	}
	log.Println("✅ coaches schema ready")

	// ── POST /api/v1/uploads — stores file bytes directly in PostgreSQL BYTEA ──
	v1.POST("/uploads", func(c echo.Context) error {
		fh, err := c.FormFile("file")
		if err != nil {
			return c.JSON(400, map[string]any{
				"data": nil, "error": map[string]string{"code": "VALIDATION_ERROR", "message": "file field is required", "field": "file"},
			})
		}
		if fh.Size > 500*1024*1024 {
			return c.JSON(400, map[string]any{
				"data": nil, "error": map[string]string{"code": "VALIDATION_ERROR", "message": "file exceeds 500 MB limit", "field": "file"},
			})
		}
		ext := strings.ToLower(filepath.Ext(fh.Filename))
		if !allowedExtensions[ext] {
			return c.JSON(400, map[string]any{
				"data": nil, "error": map[string]string{"code": "VALIDATION_ERROR", "message": "file type not allowed: " + ext, "field": "file"},
			})
		}

		src, err := fh.Open()
		if err != nil {
			return c.JSON(500, map[string]any{
				"data": nil, "error": map[string]string{"code": "INTERNAL_ERROR", "message": "cannot open uploaded file"},
			})
		}
		defer src.Close()

		data, err := io.ReadAll(src)
		if err != nil {
			return c.JSON(500, map[string]any{
				"data": nil, "error": map[string]string{"code": "INTERNAL_ERROR", "message": "cannot read file"},
			})
		}

		ct := extToMIME[ext]
		if ct == "" {
			ct = "application/octet-stream"
		}
		claims := sharedmw.ClaimsFrom(c)

		var id string
		if err = sqlDB.QueryRowContext(c.Request().Context(),
			`INSERT INTO file_uploads (original_name, content_type, size_bytes, file_data, uploaded_by)
			 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			fh.Filename, ct, fh.Size, data, claims.UserID,
		).Scan(&id); err != nil {
			return c.JSON(500, map[string]any{
				"data": nil, "error": map[string]string{"code": "INTERNAL_ERROR", "message": "db insert failed: " + err.Error()},
			})
		}

		return c.JSON(201, map[string]any{
			"data": map[string]any{
				"content_id":    id,
				"original_name": fh.Filename,
				"mime_type":     ct,
				"size_bytes":    fh.Size,
			},
			"error": nil,
		})
	}, sharedmw.RequireAuth())

	// ── serveUpload streams file bytes from PostgreSQL BYTEA column ───────────
	serveUpload := func(c echo.Context, disposition string) error {
		id := c.Param("id")

		var originalName, contentType string
		var fileData []byte
		if err := sqlDB.QueryRowContext(c.Request().Context(),
			`SELECT original_name, content_type, file_data FROM file_uploads WHERE id = $1`, id,
		).Scan(&originalName, &contentType, &fileData); err != nil {
			return c.JSON(404, map[string]any{
				"data": nil, "error": map[string]string{"code": "NOT_FOUND", "message": "file not found"},
			})
		}
		if len(fileData) == 0 {
			return c.JSON(404, map[string]any{
				"data": nil, "error": map[string]string{"code": "NOT_FOUND", "message": "file data missing"},
			})
		}

		c.Response().Header().Set("Content-Disposition", disposition+`; filename="`+originalName+`"`)
		c.Response().Header().Set("Cache-Control", "private, no-store")
		c.Response().Header().Set("X-Content-Type-Options", "nosniff")
		return c.Blob(200, contentType, fileData)
	}

	// GET /api/v1/uploads/:id/preview  — inline (PDF/image/video renders in browser)
	v1.GET("/uploads/:id/preview", func(c echo.Context) error {
		return serveUpload(c, "inline")
	}, sharedmw.RequireAuth())

	// GET /api/v1/uploads/:id/download — attachment (forces Save-As dialog)
	v1.GET("/uploads/:id/download", func(c echo.Context) error {
		return serveUpload(c, "attachment")
	}, sharedmw.RequireAuth())

	// ── Start ─────────────────────────────────────────────────────────────────
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("🚀 XA-LMS API running on :%s", port)
	log.Fatal(e.Start(":" + port))
}
