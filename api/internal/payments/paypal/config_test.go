package paypal

import "testing"

func setConfigEnv(t *testing.T, clientID, clientSecret, mode string) {
	t.Helper()
	t.Setenv("PAYPAL_CLIENT_ID", clientID)
	t.Setenv("PAYPAL_CLIENT_SECRET", clientSecret)
	t.Setenv("PAYPAL_MODE", mode)
}

func TestLoadConfigSandbox(t *testing.T) {
	setConfigEnv(t, "test-client-id", "test-client-secret", "sandbox")
	config, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if config.BaseURL != sandboxBaseURL {
		t.Fatalf("BaseURL = %q, want %q", config.BaseURL, sandboxBaseURL)
	}
}

func TestLoadConfigLive(t *testing.T) {
	setConfigEnv(t, "test-client-id", "test-client-secret", "live")
	config, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if config.BaseURL != liveBaseURL {
		t.Fatalf("BaseURL = %q, want %q", config.BaseURL, liveBaseURL)
	}
}

func TestLoadConfigMissingCredentials(t *testing.T) {
	for _, tt := range []struct{ name, clientID, clientSecret, want string }{
		{"client ID", "", "secret", "PAYPAL_CLIENT_ID is required"},
		{"client secret", "id", "", "PAYPAL_CLIENT_SECRET is required"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			setConfigEnv(t, tt.clientID, tt.clientSecret, "sandbox")
			_, err := LoadConfig()
			if err == nil || err.Error() != tt.want {
				t.Fatalf("error = %v, want %q", err, tt.want)
			}
		})
	}
}

// TestLoadConfigRejectsInvalidMode is the fail-fast check the task calls
// for: PAYPAL_MODE must resolve to "sandbox" or "live" — anything else
// (empty, "production", "test") is rejected rather than silently
// defaulting to either base URL.
func TestLoadConfigRejectsInvalidMode(t *testing.T) {
	for _, mode := range []string{"", "production", "test"} {
		t.Run(mode, func(t *testing.T) {
			setConfigEnv(t, "id", "secret", mode)
			_, err := LoadConfig()
			if err == nil {
				t.Fatalf("mode %q accepted, want rejection", mode)
			}
		})
	}
}

// TestLoadConfigModeIsCaseInsensitive matches this repo's existing Razorpay
// convention (payments.LoadConfig lowercases RAZORPAY_MODE before comparing)
// — PAYPAL_MODE is normalized the same way, so "Sandbox"/"LIVE" are accepted.
func TestLoadConfigModeIsCaseInsensitive(t *testing.T) {
	setConfigEnv(t, "id", "secret", "LIVE")
	config, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if config.BaseURL != liveBaseURL {
		t.Fatalf("BaseURL = %q, want %q", config.BaseURL, liveBaseURL)
	}
}
