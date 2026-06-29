package main

import (
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/auth"
	"github.com/xa-lms/api/internal/coaching"
	"github.com/xa-lms/api/internal/cohorts"
	"github.com/xa-lms/api/internal/invitations"
	"github.com/xa-lms/api/internal/organizations"
	"github.com/xa-lms/api/internal/programs"
	"github.com/xa-lms/api/internal/sessions"
	"github.com/xa-lms/api/internal/submissions"
	"github.com/xa-lms/api/internal/users"
	"github.com/xa-lms/api/pkg/database"
	"github.com/xa-lms/api/pkg/seed"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// ── Database ─────────────────────────────────────────────────────────────
	if _, err := database.Connect(); err != nil {
		log.Fatalf("❌ Database connection failed: %v", err)
	}

	// ── Migrations ────────────────────────────────────────────────────────────
	if err := database.RunMigrations(); err != nil {
		log.Fatalf("❌ Migrations failed: %v", err)
	}

	// ── Seed ──────────────────────────────────────────────────────────────────
	if err := seed.SuperAdmin(); err != nil {
		log.Fatalf("❌ Seed failed: %v", err)
	}
	if err := seed.DevUsers(); err != nil {
		log.Fatalf("❌ Dev user seed failed: %v", err)
	}

	// ── Echo ──────────────────────────────────────────────────────────────────
	e := echo.New()
	e.HideBanner = true

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{
			"http://localhost:3000",
			os.Getenv("WEB_ORIGIN"),
		},
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	}))
	e.Use(middleware.RequestID())

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

	// ── Start ─────────────────────────────────────────────────────────────────
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("🚀 XA-LMS API running on :%s", port)
	log.Fatal(e.Start(":" + port))
}
