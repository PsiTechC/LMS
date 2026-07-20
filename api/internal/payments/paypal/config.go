// Package paypal is the PayPal API client - OAuth token fetching, order
// creation, and order capture. Mirrors the sibling Razorpay client's shape
// (internal/payments/razorpay_client.go) but lives in its own subpackage
// since PayPal's request/response shapes and auth model (OAuth bearer token
// vs. Razorpay's per-request Basic Auth) are different enough to not share
// a file. No routes are wired to this package yet - service logic only.
package paypal

import (
	"fmt"
	"os"
	"strings"
)

// Config holds server-only PayPal credentials. Secrets are never returned by
// handlers or written to logs.
type Config struct {
	ClientID     string
	ClientSecret string
	Mode         string // "sandbox" | "live"
	BaseURL      string
}

const (
	sandboxBaseURL = "https://api-m.sandbox.paypal.com"
	liveBaseURL    = "https://api-m.paypal.com"
)

// LoadConfig reads PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_MODE and
// fails fast on anything invalid - same pattern as payments.LoadConfig for
// Razorpay. PAYPAL_MODE must be exactly "sandbox" or "live"; sandbox and live
// are entirely separate PayPal credential pools, so a mismatched pair (e.g.
// live credentials pasted in under PAYPAL_MODE=sandbox) is not caught here -
// that surfaces as invalid_client from the token endpoint (see client.go).
func LoadConfig() (Config, error) {
	config := Config{
		ClientID:     strings.TrimSpace(os.Getenv("PAYPAL_CLIENT_ID")),
		ClientSecret: strings.TrimSpace(os.Getenv("PAYPAL_CLIENT_SECRET")),
		Mode:         strings.ToLower(strings.TrimSpace(os.Getenv("PAYPAL_MODE"))),
	}
	if config.ClientID == "" {
		return Config{}, fmt.Errorf("PAYPAL_CLIENT_ID is required")
	}
	if config.ClientSecret == "" {
		return Config{}, fmt.Errorf("PAYPAL_CLIENT_SECRET is required")
	}
	baseURL, err := resolveBaseURL(config.Mode)
	if err != nil {
		return Config{}, err
	}
	config.BaseURL = baseURL
	return config, nil
}

func resolveBaseURL(mode string) (string, error) {
	switch mode {
	case "sandbox":
		return sandboxBaseURL, nil
	case "live":
		return liveBaseURL, nil
	default:
		return "", fmt.Errorf("PAYPAL_MODE must be sandbox or live")
	}
}
