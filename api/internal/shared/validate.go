package shared

import "regexp"

var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// phonePattern accepts an optional leading "+" followed by 7-15 digits,
// permissive of spaces/hyphens already present in the input (callers should
// strip formatting before matching if they want a stricter check).
var phonePattern = regexp.MustCompile(`^\+?[0-9\s\-()]{7,20}$`)

// IsValidEmail does a basic format check - not full RFC 5322, just enough to
// catch obviously malformed input at the API boundary before it reaches the
// DB or an outbound email send.
func IsValidEmail(email string) bool {
	return emailPattern.MatchString(email)
}

// IsValidPhone does a basic format check for a mobile number: optional
// leading "+", 7-20 chars of digits/spaces/hyphens/parens.
func IsValidPhone(phone string) bool {
	return phonePattern.MatchString(phone)
}
