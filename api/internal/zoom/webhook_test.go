package zoom

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

func withWebhookSecret(t *testing.T, secret string) {
	t.Helper()
	orig := os.Getenv("ZOOM_WEBHOOK_SECRET_TOKEN")
	os.Setenv("ZOOM_WEBHOOK_SECRET_TOKEN", secret)
	t.Cleanup(func() { os.Setenv("ZOOM_WEBHOOK_SECRET_TOKEN", orig) })
}

func signFor(secret, timestamp, body string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(fmt.Sprintf("v0:%s:%s", timestamp, body)))
	return "v0=" + hex.EncodeToString(mac.Sum(nil))
}

func TestVerifyWebhookSignature_ValidPayloadAccepted(t *testing.T) {
	withWebhookSecret(t, "test-secret")
	body := `{"event":"meeting.started"}`
	sig := signFor("test-secret", "1700000000", body)

	if !VerifyWebhookSignature(sig, "1700000000", body) {
		t.Fatal("expected valid signature to be accepted")
	}
}

func TestVerifyWebhookSignature_TamperedBodyRejected(t *testing.T) {
	withWebhookSecret(t, "test-secret")
	sig := signFor("test-secret", "1700000000", `{"event":"meeting.started"}`)

	// Body was mutated after signing — signature no longer matches.
	if VerifyWebhookSignature(sig, "1700000000", `{"event":"meeting.ended"}`) {
		t.Fatal("expected tampered body to be rejected")
	}
}

func TestVerifyWebhookSignature_WrongSecretRejected(t *testing.T) {
	withWebhookSecret(t, "real-secret")
	body := `{"event":"meeting.started"}`
	sig := signFor("attacker-guessed-secret", "1700000000", body)

	if VerifyWebhookSignature(sig, "1700000000", body) {
		t.Fatal("expected signature made with the wrong secret to be rejected")
	}
}

func TestVerifyWebhookSignature_MissingSecretRejected(t *testing.T) {
	withWebhookSecret(t, "")
	body := `{"event":"meeting.started"}`
	sig := signFor("whatever", "1700000000", body)

	if VerifyWebhookSignature(sig, "1700000000", body) {
		t.Fatal("expected verification to fail when ZOOM_WEBHOOK_SECRET_TOKEN is unset")
	}
}

func TestHandleWebhook_URLValidationChallenge(t *testing.T) {
	withWebhookSecret(t, "test-secret")
	body, _ := json.Marshal(map[string]any{
		"event":   "endpoint.url_validation",
		"payload": map[string]string{"plainToken": "abc123"},
	})

	resp, err := HandleWebhook(body)
	if err != nil {
		t.Fatalf("HandleWebhook: %v", err)
	}
	if resp["plainToken"] != "abc123" {
		t.Fatalf("plainToken = %q", resp["plainToken"])
	}

	mac := hmac.New(sha256.New, []byte("test-secret"))
	mac.Write([]byte("abc123"))
	want := hex.EncodeToString(mac.Sum(nil))
	if resp["encryptedToken"] != want {
		t.Fatalf("encryptedToken = %q, want %q", resp["encryptedToken"], want)
	}
}
