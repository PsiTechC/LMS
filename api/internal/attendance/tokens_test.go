package attendance

import (
	"testing"

	"github.com/google/uuid"
)

func TestGenerateAndVerifySignedToken_RoundTrip(t *testing.T) {
	t.Setenv("ATTENDANCE_SIGNING_SECRET", "test-secret-value")

	sessionID := uuid.New()
	token, err := GenerateSignedToken(sessionID)
	if err != nil {
		t.Fatalf("GenerateSignedToken: %v", err)
	}
	if token == "" {
		t.Fatal("expected a non-empty token")
	}

	got, err := VerifySignedToken(token)
	if err != nil {
		t.Fatalf("VerifySignedToken: %v", err)
	}
	if got != sessionID {
		t.Fatalf("VerifySignedToken session id = %v, want %v", got, sessionID)
	}
}

func TestVerifySignedToken_RejectsTamperedPayload(t *testing.T) {
	t.Setenv("ATTENDANCE_SIGNING_SECRET", "test-secret-value")

	token, err := GenerateSignedToken(uuid.New())
	if err != nil {
		t.Fatalf("GenerateSignedToken: %v", err)
	}

	// Flip the token to a different (still valid-shaped) session id's token —
	// its signature can't match this token's payload.
	other, err := GenerateSignedToken(uuid.New())
	if err != nil {
		t.Fatalf("GenerateSignedToken: %v", err)
	}
	tamperedPayload := splitTokenParts(t, other)[0]
	originalSig := splitTokenParts(t, token)[1]
	tampered := tamperedPayload + "." + originalSig

	if _, err := VerifySignedToken(tampered); err == nil {
		t.Fatal("expected an error for a tampered/mismatched token")
	}
}

func TestVerifySignedToken_RejectsWrongSecret(t *testing.T) {
	t.Setenv("ATTENDANCE_SIGNING_SECRET", "secret-a")
	token, err := GenerateSignedToken(uuid.New())
	if err != nil {
		t.Fatalf("GenerateSignedToken: %v", err)
	}

	t.Setenv("ATTENDANCE_SIGNING_SECRET", "secret-b")
	if _, err := VerifySignedToken(token); err == nil {
		t.Fatal("expected verification to fail once the signing secret changes")
	}
}

func TestVerifySignedToken_RejectsMalformedInput(t *testing.T) {
	t.Setenv("ATTENDANCE_SIGNING_SECRET", "test-secret-value")

	cases := []string{"", "no-dot-here", "onlyone.", ".onlyone", "a.b.c"}
	for _, tc := range cases {
		if _, err := VerifySignedToken(tc); err == nil {
			t.Fatalf("VerifySignedToken(%q) = nil error, want error", tc)
		}
	}
}

func TestGenerateSessionCode_ShapeAndAlphabet(t *testing.T) {
	for i := 0; i < 50; i++ {
		code, err := GenerateSessionCode()
		if err != nil {
			t.Fatalf("GenerateSessionCode: %v", err)
		}
		if len(code) != codeLength {
			t.Fatalf("code %q has length %d, want %d", code, len(code), codeLength)
		}
		for _, r := range code {
			if !containsRune(codeAlphabet, r) {
				t.Fatalf("code %q contains a character outside the allowed alphabet: %q", code, r)
			}
		}
	}
}

func splitTokenParts(t *testing.T, token string) [2]string {
	t.Helper()
	for i := 0; i < len(token); i++ {
		if token[i] == '.' {
			return [2]string{token[:i], token[i+1:]}
		}
	}
	t.Fatalf("token %q has no '.' separator", token)
	return [2]string{}
}

func containsRune(s string, r rune) bool {
	for _, c := range s {
		if c == r {
			return true
		}
	}
	return false
}
