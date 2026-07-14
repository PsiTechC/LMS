package payments

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func webhookSig(body []byte, secret string) string {
	m := hmac.New(sha256.New, []byte(secret))
	_, _ = m.Write(body)
	return hex.EncodeToString(m.Sum(nil))
}

func TestVerifyWebhookSignatureUsesExactRawBody(t *testing.T) {
	raw := []byte(`{"event":"order.paid","payload":{"x":1}}`)
	sig := webhookSig(raw, "webhook-secret")
	if err := VerifyWebhookSignature(raw, sig, "webhook-secret"); err != nil {
		t.Fatal(err)
	}
	modified := []byte(`{"event":"order.paid","payload":{"x":2}}`)
	if err := VerifyWebhookSignature(modified, sig, "webhook-secret"); err == nil {
		t.Fatal("modified body accepted")
	}
	if err := VerifyWebhookSignature(raw, "", "webhook-secret"); err == nil {
		t.Fatal("missing signature accepted")
	}
	for _, malformed := range []string{"not-hex", "00", string(make([]byte, sha256.Size*2+1))} {
		if err := VerifyWebhookSignature(raw, malformed, "webhook-secret"); err == nil {
			t.Fatalf("malformed signature accepted: %q", malformed)
		}
	}
}

func TestWebhookValuesPreferOrderAndFallbackToPayment(t *testing.T) {
	var p webhookEnvelope
	p.Payload.Order.Entity.ID = "order_1"
	p.Payload.Order.Entity.Amount = 1200
	p.Payload.Order.Entity.Currency = "INR"
	p.Payload.Payment.Entity.ID = "pay_1"
	p.Payload.Payment.Entity.OrderID = "order_ignored"
	orderID, paymentID, amount, currency := webhookValues(p)
	if orderID != "order_1" || paymentID != "pay_1" || amount != 1200 || currency != "INR" {
		t.Fatalf("unexpected values: %q %q %d %q", orderID, paymentID, amount, currency)
	}
	p.Payload.Order.Entity.ID, p.Payload.Order.Entity.Amount, p.Payload.Order.Entity.Currency = "", 0, ""
	orderID, _, amount, currency = webhookValues(p)
	if orderID != "order_ignored" || amount != 0 || currency != "" {
		t.Fatalf("unexpected fallback: %q %d %q", orderID, amount, currency)
	}
}

func TestWebhookBodyLimitIsBounded(t *testing.T) {
	if maxWebhookBody <= 0 || maxWebhookBody > 1024*1024 {
		t.Fatalf("unsafe webhook body limit: %d", maxWebhookBody)
	}
}
