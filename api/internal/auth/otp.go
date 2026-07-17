package auth

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/xa-lms/api/pkg/email"
)

// ── Developer OTP login ──────────────────────────────────────────
// Lets a developer sign into ANY profile with a fixed OTP, or with a
// random OTP emailed on demand. This is DEV-ONLY convenience: the whole
// feature is disabled unless ENABLE_OTP_LOGIN=true. When disabled, the
// endpoints return ErrOTPDisabled and behave as if they don't exist.
//
// The fixed OTP is configurable via DEV_OTP_CODE (default "090999").
// Sent OTPs are held in memory with a short TTL — no DB table needed since
// this is a dev aid, not a production credential path.

const defaultDevOTP = "090999"
const otpTTL = 10 * time.Minute

var (
	ErrOTPDisabled = errors.New("otp login is disabled")
	ErrInvalidOTP  = errors.New("invalid or expired otp")
)

// otpEntry is a sent OTP awaiting use.
type otpEntry struct {
	code      string
	expiresAt time.Time
}

var (
	otpStore   = map[string]otpEntry{} // key: lowercased email
	otpStoreMu sync.Mutex
)

// otpEnabled reports whether the dev OTP login feature is turned on.
func otpEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("ENABLE_OTP_LOGIN")))
	return v == "true" || v == "1" || v == "yes"
}

// fixedDevOTP returns the always-valid dev code.
func fixedDevOTP() string {
	if c := strings.TrimSpace(os.Getenv("DEV_OTP_CODE")); c != "" {
		return c
	}
	return defaultDevOTP
}

// sendOTPService generates a random 6-digit OTP, stores it with a TTL, and
// emails it. Always returns nil to the caller (don't reveal whether the email
// exists) but only stores/sends when the email maps to a real user.
func sendOTPService(reqEmail string) error {
	if !otpEnabled() {
		return ErrOTPDisabled
	}
	e := strings.ToLower(strings.TrimSpace(reqEmail))
	if e == "" {
		return errors.New("email is required")
	}

	user, err := findUserByEmail(e)
	if err != nil {
		// Unknown email — silently succeed (the fixed OTP still won't find a user).
		return nil
	}

	code, err := random6Digit()
	if err != nil {
		return err
	}
	otpStoreMu.Lock()
	otpStore[e] = otpEntry{code: code, expiresAt: time.Now().Add(otpTTL)}
	otpStoreMu.Unlock()

	// Email the code (non-blocking — delivery isn't required since the fixed
	// code always works as a fallback).
	go sendOTPEmail(user.Name, string(user.Email), code)
	return nil
}

// otpLoginService validates the OTP (fixed dev code OR a sent code) and, on
// success, issues a login token for the user with that email — bypassing the
// password and email-verification checks (dev convenience).
func otpLoginService(reqEmail, otp string) (*LoginResponse, error) {
	if !otpEnabled() {
		return nil, ErrOTPDisabled
	}
	e := strings.ToLower(strings.TrimSpace(reqEmail))
	code := strings.TrimSpace(otp)
	if e == "" || code == "" {
		return nil, ErrInvalidOTP
	}

	if !otpMatches(e, code) {
		return nil, ErrInvalidOTP
	}

	user, err := findUserByEmail(e)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}
	if !user.IsActive {
		return nil, ErrInactiveAccount
	}

	// One-time use: clear any sent OTP for this email.
	otpStoreMu.Lock()
	delete(otpStore, e)
	otpStoreMu.Unlock()

	token, err := generateJWT(user)
	if err != nil {
		return nil, err
	}
	return &LoginResponse{
		AccessToken: token,
		User:        buildUserDTO(user),
	}, nil
}

// otpMatches is true when code equals the fixed dev OTP, or a non-expired
// sent OTP for this email.
func otpMatches(email, code string) bool {
	if code == fixedDevOTP() {
		return true
	}
	otpStoreMu.Lock()
	defer otpStoreMu.Unlock()
	entry, ok := otpStore[email]
	if !ok {
		return false
	}
	if time.Now().After(entry.expiresAt) {
		delete(otpStore, email)
		return false
	}
	return entry.code == code
}

func random6Digit() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func sendOTPEmail(name, toEmail, code string) {
	body := email.OTPTemplate(name, code)
	_ = email.Send(toEmail, "Your Intellique sign-in code", body)
}
