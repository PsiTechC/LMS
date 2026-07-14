package payments

import (
	"fmt"
	"os"
	"strings"
)

// Config holds server-only Razorpay credentials. Secrets are never returned by
// handlers or written to logs. Mode, when set, prevents test/live key mixing.
type Config struct {
	KeyID         string
	KeySecret     string
	WebhookSecret string
	Mode          string
}

func LoadConfig() (Config, error) {
	config := Config{
		KeyID:         strings.TrimSpace(os.Getenv("RAZORPAY_KEY_ID")),
		KeySecret:     strings.TrimSpace(os.Getenv("RAZORPAY_KEY_SECRET")),
		WebhookSecret: strings.TrimSpace(os.Getenv("RAZORPAY_WEBHOOK_SECRET")),
		Mode:          strings.ToLower(strings.TrimSpace(os.Getenv("RAZORPAY_MODE"))),
	}
	if config.KeyID == "" {
		return Config{}, fmt.Errorf("RAZORPAY_KEY_ID is required")
	}
	if config.KeySecret == "" {
		return Config{}, fmt.Errorf("RAZORPAY_KEY_SECRET is required")
	}
	if config.Mode != "" && config.Mode != "test" && config.Mode != "live" {
		return Config{}, fmt.Errorf("RAZORPAY_MODE must be test or live")
	}
	if config.Mode == "test" && !strings.HasPrefix(config.KeyID, "rzp_test_") {
		return Config{}, fmt.Errorf("RAZORPAY_KEY_ID does not match test mode")
	}
	if config.Mode == "live" && !strings.HasPrefix(config.KeyID, "rzp_live_") {
		return Config{}, fmt.Errorf("RAZORPAY_KEY_ID does not match live mode")
	}
	return config, nil
}
