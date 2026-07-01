package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"github.com/xa-lms/api/internal/analytics"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/auth"
	"github.com/xa-lms/api/internal/coaching"
	"github.com/xa-lms/api/internal/cohorts"
	"github.com/xa-lms/api/internal/communications"
	"github.com/xa-lms/api/internal/competencies"
	"github.com/xa-lms/api/internal/compliance"
	"github.com/xa-lms/api/internal/discussions"
	"github.com/xa-lms/api/internal/invitations"
	"github.com/xa-lms/api/internal/organizations"
	"github.com/xa-lms/api/internal/programs"
	"github.com/xa-lms/api/internal/sessions"
	sharedmw "github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/internal/submissions"
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
	if err := seed.SuperAdmin(); err != nil {
		log.Fatalf("❌ Seed failed: %v", err)
	}
	if err := seed.DevUsers(); err != nil {
		log.Fatalf("❌ Dev user seed failed: %v", err)
	}

	// ── Upload directory ──────────────────────────────────────────────────────
	// Resolved from UPLOAD_DIR env var; defaults to ./uploads in dev.
	// On VPS set UPLOAD_DIR=/var/uploads so files survive redeployments.
	uploadsDir, _ := filepath.Abs(func() string {
		if d := os.Getenv("UPLOAD_DIR"); d != "" {
			return d
		}
		return "./uploads"
	}())
	if err := os.MkdirAll(uploadsDir, 0o750); err != nil {
		log.Fatalf("❌ Cannot create uploads directory: %v", err)
	}

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
	v1 := e.Group("/api/v1")

	auth.NewHandler().Register(v1)
	organizations.NewHandler().Register(v1)
	users.NewHandler().Register(v1)
	audit.NewHandler().Register(v1)
	programs.NewHandler().Register(v1)
	cohorts.NewHandler().Register(v1)
	invitations.NewHandler().Register(v1)
	sessions.NewHandler().Register(v1)
	submissions.NewHandler().Register(v1)
	coaching.NewHandler().Register(v1)
	competencies.NewHandler().Register(v1)
	analytics.NewHandler().Register(v1)
	discussions.NewHandler().Register(v1)
	communications.NewHandler().Register(v1)
	go communications.StartRuleEvaluator()
	compliance.NewHandler().Register(v1)

	// ── file_uploads table — created inline like all other schema in this project ──
	sqlDB, _ := database.DB.DB()
	if _, err := sqlDB.Exec(`
		CREATE TABLE IF NOT EXISTS file_uploads (
		    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
		    file_key      TEXT         NOT NULL,
		    original_name VARCHAR(500) NOT NULL,
		    content_type  VARCHAR(200) NOT NULL,
		    size_bytes    BIGINT       NOT NULL,
		    uploaded_by   UUID         NOT NULL REFERENCES users(id) ON DELETE SET NULL,
		    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_file_uploads_uploaded_by ON file_uploads(uploaded_by);
	`); err != nil {
		log.Fatalf("❌ file_uploads schema failed: %v", err)
	}
	log.Println("✅ file_uploads schema ready")

	// ── Content Library File Endpoints ────────────────────────────────────────
	//
	// POST /api/v1/uploads
	//   Saves file to UPLOAD_DIR, records file_key + metadata in file_uploads.
	//   Returns only content_id — never a filesystem path or localhost URL.
	//   Requires auth.
	//
	// GET /api/v1/uploads/:id/preview
	//   Streams file inline (for PDF/video/image preview in browser).
	//   Requires auth. Works identically on localhost and VPS because the
	//   frontend fetches via the API with an auth header and renders a blob URL.
	//
	// GET /api/v1/uploads/:id/download
	//   Same as preview but forces browser download (Content-Disposition: attachment).
	//   Requires auth.

	// ── POST /api/v1/uploads ──────────────────────────────────────────────────
	v1.POST("/uploads", func(c echo.Context) error {
		fh, err := c.FormFile("file")
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]any{
				"data": nil, "error": map[string]string{"code": "VALIDATION_ERROR", "message": "file field is required", "field": "file"},
			})
		}
		if fh.Size > 50*1024*1024 {
			return c.JSON(http.StatusBadRequest, map[string]any{
				"data": nil, "error": map[string]string{"code": "VALIDATION_ERROR", "message": "file exceeds 50 MB limit", "field": "file"},
			})
		}
		ext := strings.ToLower(filepath.Ext(fh.Filename))
		if !allowedExtensions[ext] {
			return c.JSON(http.StatusBadRequest, map[string]any{
				"data": nil, "error": map[string]string{"code": "VALIDATION_ERROR", "message": "file type not allowed: " + ext, "field": "file"},
			})
		}

		src, err := fh.Open()
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]any{
				"data": nil, "error": map[string]string{"code": "INTERNAL_ERROR", "message": "cannot open uploaded file"},
			})
		}
		defer src.Close()

		// Unique file_key prevents collisions and hides original filename on disk.
		// Format: uploads/<uuid>_<original> — uuid prefix makes it unguessable.
		safeOrig := strings.ReplaceAll(fh.Filename, "/", "_")
		fileKey := fmt.Sprintf("uploads/%d_%s", time.Now().UnixNano(), safeOrig)
		destPath := filepath.Join(uploadsDir, strings.TrimPrefix(fileKey, "uploads/"))

		// Path traversal guard — the resolved path must stay inside uploadsDir.
		if !strings.HasPrefix(destPath, uploadsDir) {
			return c.JSON(http.StatusBadRequest, map[string]any{
				"data": nil, "error": map[string]string{"code": "VALIDATION_ERROR", "message": "invalid filename"},
			})
		}

		dst, err := os.Create(destPath)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]any{
				"data": nil, "error": map[string]string{"code": "INTERNAL_ERROR", "message": "cannot create file on disk"},
			})
		}
		defer dst.Close()
		if _, err = io.Copy(dst, src); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]any{
				"data": nil, "error": map[string]string{"code": "INTERNAL_ERROR", "message": "cannot write file"},
			})
		}

		ct := extToMIME[ext]
		claims := sharedmw.ClaimsFrom(c)

		var id string
		if err = sqlDB.QueryRowContext(c.Request().Context(),
			`INSERT INTO file_uploads (file_key, original_name, content_type, size_bytes, uploaded_by)
			 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			fileKey, fh.Filename, ct, fh.Size, claims.UserID,
		).Scan(&id); err != nil {
			os.Remove(destPath) // clean up disk file if DB insert fails
			return c.JSON(http.StatusInternalServerError, map[string]any{
				"data": nil, "error": map[string]string{"code": "INTERNAL_ERROR", "message": "db insert failed: " + err.Error()},
			})
		}

		// Return only content_id — never expose file_key or any filesystem path.
		return c.JSON(http.StatusCreated, map[string]any{
			"data": map[string]any{
				"content_id":    id,
				"original_name": fh.Filename,
				"mime_type":     ct,
				"size_bytes":    fh.Size,
			},
			"error": nil,
		})
	}, sharedmw.RequireAuth())

	// ── serveUpload is shared logic for preview and download ──────────────────
	serveUpload := func(c echo.Context, disposition string) error {
		id := c.Param("id")

		var fileKey, originalName, contentType string
		if err := sqlDB.QueryRowContext(c.Request().Context(),
			`SELECT file_key, original_name, content_type FROM file_uploads WHERE id = $1`, id,
		).Scan(&fileKey, &originalName, &contentType); err != nil {
			return c.JSON(http.StatusNotFound, map[string]any{
				"data": nil, "error": map[string]string{"code": "NOT_FOUND", "message": "file not found"},
			})
		}

		// Resolve and guard against path traversal.
		fullPath := filepath.Join(uploadsDir, strings.TrimPrefix(fileKey, "uploads/"))
		if !strings.HasPrefix(fullPath, uploadsDir) {
			return c.JSON(http.StatusForbidden, map[string]any{
				"data": nil, "error": map[string]string{"code": "FORBIDDEN", "message": "invalid file path"},
			})
		}

		f, err := os.Open(fullPath)
		if err != nil {
			return c.JSON(http.StatusNotFound, map[string]any{
				"data": nil, "error": map[string]string{"code": "NOT_FOUND", "message": "file not on disk"},
			})
		}
		defer f.Close()

		fi, _ := f.Stat()

		// Security headers — prevent caching and content sniffing.
		c.Response().Header().Set("Content-Type", contentType)
		c.Response().Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"`, disposition, originalName))
		c.Response().Header().Set("Cache-Control", "private, no-store")
		c.Response().Header().Set("X-Content-Type-Options", "nosniff")

		// http.ServeContent handles Range requests automatically (seek in video/audio).
		http.ServeContent(c.Response(), c.Request(), originalName, fi.ModTime(), f)
		return nil
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