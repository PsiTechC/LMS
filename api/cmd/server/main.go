package main

import (
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	// Load .env file (ignored in production — env vars set externally)
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	e := echo.New()
	e.HideBanner = true

	// ── Core middleware ─────────────────────────────────────────
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

	// ── API v1 router ───────────────────────────────────────────
	// Modules register their routes here as we build them:
	//   authHandler.Register(v1)
	//   userHandler.Register(v1)
	//   programHandler.Register(v1)
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
