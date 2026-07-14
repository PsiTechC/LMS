package payments

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func checkoutSig(orderID, paymentID, secret string) string {
	m := hmac.New(sha256.New, []byte(secret))
	_, _ = m.Write([]byte(orderID + "|" + paymentID))
	return hex.EncodeToString(m.Sum(nil))
}

func TestVerifyCheckoutSignature(t *testing.T) {
	sig := checkoutSig("order_1", "pay_1", "secret")
	if err := VerifyCheckoutSignature("order_1", "pay_1", sig, "secret"); err != nil {
		t.Fatal(err)
	}
	for name, input := range map[string]string{"invalid": "00", "altered order": checkoutSig("order_2", "pay_1", "secret"), "altered payment": checkoutSig("order_1", "pay_2", "secret"), "oversized": sig + "00"} {
		t.Run(name, func(t *testing.T) {
			if err := VerifyCheckoutSignature("order_1", "pay_1", input, "secret"); err == nil {
				t.Fatal("expected rejection")
			}
		})
	}
}
