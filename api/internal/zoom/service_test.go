package zoom

import (
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

func TestResolveSDKRole(t *testing.T) {
	cases := []struct {
		name      string
		facultyID string
		callerID  string
		want      int
	}{
		{"owning faculty gets host", "faculty-1", "faculty-1", roleHost},
		{"other caller gets attendee", "faculty-1", "participant-9", roleAttendee},
		{"empty ids never match", "", "", roleAttendee},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolveSDKRole(tc.facultyID, tc.callerID); got != tc.want {
				t.Fatalf("resolveSDKRole(%q,%q) = %d, want %d", tc.facultyID, tc.callerID, got, tc.want)
			}
		})
	}
}

func TestSignMeetingSDKJWT_StructureAndClaims(t *testing.T) {
	now := time.Now()
	sig, err := signMeetingSDKJWT("sdk-key-123", "sdk-secret-456", "987654321", roleHost, now)
	if err != nil {
		t.Fatalf("signMeetingSDKJWT: %v", err)
	}

	parsed, err := jwt.Parse(sig, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("wrong signing method")
		}
		return []byte("sdk-secret-456"), nil
	})
	if err != nil || !parsed.Valid {
		t.Fatalf("token did not validate: %v", err)
	}

	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatalf("unexpected claims type %T", parsed.Claims)
	}
	if claims["sdkKey"] != "sdk-key-123" {
		t.Errorf("sdkKey = %v", claims["sdkKey"])
	}
	if claims["mn"] != "987654321" {
		t.Errorf("mn = %v", claims["mn"])
	}
	if int(claims["role"].(float64)) != roleHost {
		t.Errorf("role = %v", claims["role"])
	}
	wantExp := float64(now.Add(sdkSignatureTTL).Unix())
	if claims["exp"].(float64) != wantExp {
		t.Errorf("exp = %v, want %v", claims["exp"], wantExp)
	}
	if claims["tokenExp"].(float64) != wantExp {
		t.Errorf("tokenExp = %v, want %v", claims["tokenExp"], wantExp)
	}
	if claims["iat"].(float64) != float64(now.Unix()) {
		t.Errorf("iat = %v", claims["iat"])
	}
}

func TestSignMeetingSDKJWT_RejectsWrongSecret(t *testing.T) {
	sig, err := signMeetingSDKJWT("sdk-key", "correct-secret", "111", roleAttendee, time.Now())
	if err != nil {
		t.Fatalf("signMeetingSDKJWT: %v", err)
	}
	_, err = jwt.Parse(sig, func(t *jwt.Token) (any, error) {
		return []byte("wrong-secret"), nil
	})
	if err == nil {
		t.Fatal("expected signature verification to fail with the wrong secret")
	}
}

func TestMapAccountLookupError_MissingAccountBecomesClearError(t *testing.T) {
	got := mapAccountLookupError(ErrNotFound)
	if !errors.Is(got, ErrMissingZoomAccount) {
		t.Fatalf("mapAccountLookupError(ErrNotFound) = %v, want ErrMissingZoomAccount", got)
	}
}

func TestMapAccountLookupError_OtherErrorsPassThrough(t *testing.T) {
	other := errors.New("db is down")
	if got := mapAccountLookupError(other); got != other {
		t.Fatalf("mapAccountLookupError(other) = %v, want unchanged %v", got, other)
	}
}
