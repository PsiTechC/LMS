package database

import (
	"fmt"
	"log"
	"os"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// resolveLogLevel picks the GORM log level. Priority:
//  1. DB_LOG_LEVEL env var - one of: silent | error | warn | info
//  2. production APP_ENV → silent
//  3. default → warn (only slow queries + errors; no per-query spam)
//
// Set DB_LOG_LEVEL=info to get the old verbose "log every SQL statement" behaviour
// back when debugging.
func resolveLogLevel() logger.LogLevel {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("DB_LOG_LEVEL"))) {
	case "silent":
		return logger.Silent
	case "error":
		return logger.Error
	case "warn":
		return logger.Warn
	case "info":
		return logger.Info
	}
	if os.Getenv("APP_ENV") == "production" {
		return logger.Silent
	}
	return logger.Warn
}

func Connect() (*gorm.DB, error) {
	dsn := os.Getenv("DB_URL")
	if dsn == "" {
		return nil, fmt.Errorf("DB_URL environment variable is not set")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(resolveLogLevel()),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

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
