package database

import (
	"fmt"
	"log"
	"os"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Connect() (*gorm.DB, error) {
	dsn := os.Getenv("DB_URL")
	if dsn == "" {
		return nil, fmt.Errorf("DB_URL environment variable is not set")
	}

	// Log level — detailed in dev, silent in prod
	logLevel := logger.Info
	if os.Getenv("APP_ENV") == "production" {
		logLevel = logger.Silent
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Connection pool settings
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get sql.DB: %w", err)
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)

	DB = db
	log.Println("✅ Database connected")
	return db, nil
}

// RunMigrations applies all pending migrations automatically on startup.
// Migration files in api/migrations/ are applied in order.
// Already-applied migrations are skipped safely.
func RunMigrations() error {
	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		return fmt.Errorf("DB_URL environment variable is not set")
	}

	m, err := migrate.New("file://migrations", dbURL)
	if err != nil {
		return fmt.Errorf("failed to init migrations: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migration failed: %w", err)
	}

	if err == migrate.ErrNoChange {
		log.Println("✅ Migrations — nothing new to apply")
	} else {
		log.Println("✅ Migrations applied successfully")
	}

	return nil
}
