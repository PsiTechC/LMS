package payments

import (
	"strings"
	"testing"
)

func setConfigEnv(t *testing.T, keyID, keySecret, webhookSecret string) {
	t.Helper()
	t.Setenv("RAZORPAY_KEY_ID", keyID)
	t.Setenv("RAZORPAY_KEY_SECRET", keySecret)
	t.Setenv("RAZORPAY_WEBHOOK_SECRET", webhookSecret)
}
func TestLoadConfig(t *testing.T) {
	setConfigEnv(t, "test-key-id", "test-key-secret", "")
	config, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if config.KeyID != "test-key-id" || config.KeySecret != "test-key-secret" {
		t.Fatal("credentials not loaded")
	}
}
func TestLoadConfigMissingOrderCredentials(t *testing.T) {
	for _, tt := range []struct{ name, keyID, keySecret, want string }{{"key ID", "", "test-key-secret", "RAZORPAY_KEY_ID is required"}, {"key secret", "test-key-id", "", "RAZORPAY_KEY_SECRET is required"}} {
		t.Run(tt.name, func(t *testing.T) {
			setConfigEnv(t, tt.keyID, tt.keySecret, "")
			_, err := LoadConfig()
			if err == nil || err.Error() != tt.want {
				t.Fatalf("error = %v", err)
			}
			for _, secret := range []string{"test-key-id", "test-key-secret"} {
				if strings.Contains(err.Error(), secret) {
					t.Fatal("credential leaked")
				}
			}
		})
	}
}

func TestLoadConfigRejectsModeKeyMismatch(t *testing.T) {
	setConfigEnv(t, "rzp_live_example", "secret", "")
	t.Setenv("RAZORPAY_MODE", "test")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("live key accepted in test mode")
	}
}
