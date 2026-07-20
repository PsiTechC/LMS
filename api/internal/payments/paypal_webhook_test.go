package payments

import (
	"context"
	"encoding/json"
	"testing"
)

// TestPaypalWebhookEnvelopeParsesRealisticPayload confirms the envelope and
// capture-resource structs match PayPal's actual documented webhook shape -
// a flat id/event_type plus a polymorphic "resource" object, distinct from
// Razorpay's nested payload.order.entity/payload.payment.entity shape (see
// webhook.go's webhookEnvelope).
func TestPaypalWebhookEnvelopeParsesRealisticPayload(t *testing.T) {
	raw := []byte(`{
		"id": "WH-2WR32451HC0233532-67976317FL4543714",
		"event_type": "PAYMENT.CAPTURE.COMPLETED",
		"resource": {
			"id": "3C679366HH908993F",
			"status": "COMPLETED",
			"amount": {"currency_code": "USD", "value": "49.99"},
			"supplementary_data": {"related_ids": {"order_id": "1B646247DT770131E"}}
		}
	}`)
	var envelope paypalWebhookEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.ID != "WH-2WR32451HC0233532-67976317FL4543714" || envelope.EventType != "PAYMENT.CAPTURE.COMPLETED" {
		t.Fatalf("envelope = %+v", envelope)
	}

	var resource paypalCaptureResource
	if err := json.Unmarshal(envelope.Resource, &resource); err != nil {
		t.Fatal(err)
	}
	if resource.ID != "3C679366HH908993F" || resource.Status != "COMPLETED" {
		t.Fatalf("resource = %+v", resource)
	}
	if resource.Amount.CurrencyCode != "USD" || resource.Amount.Value != "49.99" {
		t.Fatalf("resource.Amount = %+v", resource.Amount)
	}
	if resource.SupplementaryData.RelatedIDs.OrderID != "1B646247DT770131E" {
		t.Fatalf("resource.SupplementaryData = %+v", resource.SupplementaryData)
	}
}

// TestProcessPaypalWebhookEventApprovedIsNoOp confirms
// CHECKOUT.ORDER.APPROVED never touches the database - it's informational
// only, per the task's spec (capture happens later, that's what actually
// finalizes the order).
func TestProcessPaypalWebhookEventApprovedIsNoOp(t *testing.T) {
	payload := paypalWebhookEnvelope{EventType: "CHECKOUT.ORDER.APPROVED"}
	if err := processPaypalWebhookEvent(context.Background(), payload); err != nil {
		t.Fatalf("error = %v, want nil", err)
	}
}

// TestProcessPaypalWebhookEventUnknownTypeIsNoOp mirrors Razorpay's webhook
// handler default case - unrecognized event types are acknowledged, not
// treated as errors.
func TestProcessPaypalWebhookEventUnknownTypeIsNoOp(t *testing.T) {
	payload := paypalWebhookEnvelope{EventType: "SOME.FUTURE.EVENT"}
	if err := processPaypalWebhookEvent(context.Background(), payload); err != nil {
		t.Fatalf("error = %v, want nil", err)
	}
}

// TestProcessPaypalWebhookEventCaptureCompletedRejectsMalformed confirms
// missing required fields are rejected before any database lookup runs.
func TestProcessPaypalWebhookEventCaptureCompletedRejectsMalformed(t *testing.T) {
	for _, tt := range []struct {
		name     string
		resource string
	}{
		{"missing order id", `{"id":"CAP-1","amount":{"currency_code":"USD","value":"49.99"}}`},
		{"missing capture id", `{"amount":{"currency_code":"USD","value":"49.99"},"supplementary_data":{"related_ids":{"order_id":"ORDER-1"}}}`},
		{"missing amount value", `{"id":"CAP-1","amount":{"currency_code":"USD"},"supplementary_data":{"related_ids":{"order_id":"ORDER-1"}}}`},
		{"missing currency code", `{"id":"CAP-1","amount":{"value":"49.99"},"supplementary_data":{"related_ids":{"order_id":"ORDER-1"}}}`},
	} {
		t.Run(tt.name, func(t *testing.T) {
			payload := paypalWebhookEnvelope{EventType: "PAYMENT.CAPTURE.COMPLETED", Resource: json.RawMessage(tt.resource)}
			if err := processPaypalWebhookEvent(context.Background(), payload); err != ErrMalformedWebhook {
				t.Fatalf("error = %v, want ErrMalformedWebhook", err)
			}
		})
	}
}

// TestProcessPaypalWebhookEventCaptureDeniedRejectsMalformed is the same
// guard for PAYMENT.CAPTURE.DENIED.
func TestProcessPaypalWebhookEventCaptureDeniedRejectsMalformed(t *testing.T) {
	payload := paypalWebhookEnvelope{EventType: "PAYMENT.CAPTURE.DENIED", Resource: json.RawMessage(`{"id":"CAP-1"}`)}
	if err := processPaypalWebhookEvent(context.Background(), payload); err != ErrMalformedWebhook {
		t.Fatalf("error = %v, want ErrMalformedWebhook", err)
	}
}

func TestProcessPaypalWebhookEventUnparsableResourceRejected(t *testing.T) {
	payload := paypalWebhookEnvelope{EventType: "PAYMENT.CAPTURE.COMPLETED", Resource: json.RawMessage(`not-json`)}
	if err := processPaypalWebhookEvent(context.Background(), payload); err != ErrMalformedWebhook {
		t.Fatalf("error = %v, want ErrMalformedWebhook", err)
	}
}
