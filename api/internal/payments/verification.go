package payments

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

var ErrInvalidCheckoutSignature = errors.New("invalid checkout signature")

// VerifyCheckoutSignature verifies Razorpay Checkout's HMAC-SHA256 signature.
func VerifyCheckoutSignature(orderID, paymentID, signature, secret string) error {
	if strings.TrimSpace(orderID) == "" || strings.TrimSpace(paymentID) == "" || strings.TrimSpace(secret) == "" {
		return ErrInvalidCheckoutSignature
	}
	signature = strings.TrimSpace(signature)
	if len(signature) != sha256.Size*2 {
		return ErrInvalidCheckoutSignature
	}
	provided, err := hex.DecodeString(signature)
	if err != nil || len(provided) != sha256.Size {
		return ErrInvalidCheckoutSignature
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(orderID + "|" + paymentID))
	if !hmac.Equal(provided, mac.Sum(nil)) {
		return ErrInvalidCheckoutSignature
	}
	return nil
}
