package main

import (
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/xa-lms/api/pkg/database"
)

func main() {
	// Load .env (ignored in production)
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// ── Database ────────────────────────────────────────────────
	if _, err := database.Connect(); err != nil {
		log.Fatalf("❌ Database connection failed: %v", err)
	}

	// ── Migrations — runs automatically on every startup ────────
	if err := database.RunMigrations(); err != nil {
		log.Fatalf("❌ Migrations failed: %v", err)
	}

	// ── Echo server ─────────────────────────────────────────────
	e := echo.New()

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())
	e.Use(middleware.RequestID())

	// ── Health check ────────────────────────────────────────────
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(200, map[string]string{
			"status":  "ok",
			"service": "xa-lms-api",
			"env":     os.Getenv("APP_ENV"),
		})
	})

	// ── API v1 ──────────────────────────────────────────────────
	// Modules register here as we build them:
	//   authHandler.Register(v1)
	//   userHandler.Register(v1)
	v1 := e.Group("/api/v1")
	_ = v1

	// ── Start ───────────────────────────────────────────────────
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🚀 XA-LMS API running on :%s", port)
	log.Fatal(e.Start(":" + port))
}