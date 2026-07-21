package payments

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/payments/paypal"
	"github.com/xa-lms/api/internal/shared"
)

// paypalWebhookEnvelope is PayPal's webhook event shape - very different
// from Razorpay's (see webhookEnvelope in webhook.go): a flat event id/type
// plus a single polymorphic "resource" object whose shape depends on
// event_type. Resource is kept raw and decoded per-event-type in
// processPaypalWebhookEvent.
type paypalWebhookEnvelope struct {
	ID        string          `json:"id"`
	EventType string          `json:"event_type"`
	Resource  json.RawMessage `json:"resource"`
}

// paypalCaptureResource covers PAYMENT.CAPTURE.COMPLETED/DENIED - the
// resource is the capture itself, whose supplementary_data.related_ids
// links back to the order this system actually stores.
type paypalCaptureResource struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Amount struct {
		CurrencyCode string `json:"currency_code"`
		Value        string `json:"value"`
	} `json:"amount"`
	SupplementaryData struct {
		RelatedIDs struct {
			OrderID string `json:"order_id"`
		} `json:"related_ids"`
	} `json:"supplementary_data"`
}

// paypalWebhook is PayPal's counterpart to webhook.go's Razorpay handler.
// Verification works differently - PayPal requires calling their own
// verify-webhook-signature API rather than computing a local HMAC - but
// everything downstream (dedupe via persistWebhookEvent, per-event
// processing, ack-with-204-even-on-processing-failure so PayPal doesn't
// retry-storm a poison event) mirrors the Razorpay handler's shape.
func (h *Handler) paypalWebhook(c echo.Context) error {
	webhookID := strings.TrimSpace(os.Getenv("PAYPAL_WEBHOOK_ID"))
	if webhookID == "" {
		return shared.BadRequest(c, "WEBHOOK_UNAVAILABLE", "webhook is not configured", "")
	}
	loadPaypalConfig := h.loadPaypalConfig
	if loadPaypalConfig == nil {
		loadPaypalConfig = paypal.LoadConfig
	}
	config, err := loadPaypalConfig()
	if err != nil {
		return shared.BadRequest(c, "WEBHOOK_UNAVAILABLE", "webhook is not configured", "")
	}

	body, err := io.ReadAll(io.LimitReader(c.Request().Body, maxWebhookBody+1))
	if err != nil || len(body) > maxWebhookBody {
		return shared.BadRequest(c, "INVALID_WEBHOOK", "invalid webhook body", "")
	}

	client := h.paypalClient
	if client == nil {
		client = paypal.NewClient(config, nil)
	}
	headers := paypal.WebhookHeaders{
		TransmissionID:   c.Request().Header.Get("PAYPAL-TRANSMISSION-ID"),
		TransmissionTime: c.Request().Header.Get("PAYPAL-TRANSMISSION-TIME"),
		TransmissionSig:  c.Request().Header.Get("PAYPAL-TRANSMISSION-SIG"),
		CertURL:          c.Request().Header.Get("PAYPAL-CERT-URL"),
		AuthAlgo:         c.Request().Header.Get("PAYPAL-AUTH-ALGO"),
	}
	verified, err := client.VerifyWebhookSignature(c.Request().Context(), headers, body, webhookID)
	if err != nil || !verified {
		return shared.Unauthorized(c, "invalid webhook signature")
	}

	var payload paypalWebhookEnvelope
	if err := json.Unmarshal(body, &payload); err != nil || payload.EventType == "" {
		return shared.BadRequest(c, "INVALID_WEBHOOK", "malformed webhook payload", "")
	}

	duplicate, event, err := persistWebhookEvent("paypal", payload.EventType, payload.ID, "", "", body)
	if err != nil {
		return shared.InternalError(c, "failed to record webhook")
	}
	if duplicate {
		return c.NoContent(http.StatusNoContent)
	}
	if err := processPaypalWebhookEvent(c.Request().Context(), payload); err != nil {
		_ = markWebhookEvent(event.ID, false, err.Error())
		return c.NoContent(http.StatusNoContent)
	}
	_ = markWebhookEvent(event.ID, true, "")
	return c.NoContent(http.StatusNoContent)
}

func processPaypalWebhookEvent(ctx context.Context, payload paypalWebhookEnvelope) error {
	switch payload.EventType {
	case "CHECKOUT.ORDER.APPROVED":
		// Informational only - the payer has approved but capture hasn't
		// happened yet. No local state change; PAYMENT.CAPTURE.COMPLETED is
		// what actually finalizes the order.
		return nil

	case "PAYMENT.CAPTURE.COMPLETED":
		var resource paypalCaptureResource
		if err := json.Unmarshal(payload.Resource, &resource); err != nil {
			return ErrMalformedWebhook
		}
		orderID := resource.SupplementaryData.RelatedIDs.OrderID
		if orderID == "" || resource.ID == "" || resource.Amount.Value == "" || resource.Amount.CurrencyCode == "" {
			return ErrMalformedWebhook
		}
		order, err := getPaymentOrderByPaypalOrderIDAny(orderID)
		if err != nil {
			return err
		}
		amountMinorUnits, err := paypal.ParseAmount(resource.Amount.Value, resource.Amount.CurrencyCode)
		if err != nil {
			return ErrMalformedWebhook
		}
		_, err = FinalizePaidOrder(ctx, FinalizePaidOrderInput{
			OrganizationID:    order.OrgID,
			ParticipantID:     order.UserID,
			PaymentOrderID:    order.ID,
			ProviderOrderID:   orderID,
			ProviderPaymentID: resource.ID,
			ProviderAmount:    amountMinorUnits,
			ProviderCurrency:  strings.ToUpper(resource.Amount.CurrencyCode),
		})
		return err

	case "PAYMENT.CAPTURE.DENIED":
		var resource paypalCaptureResource
		if err := json.Unmarshal(payload.Resource, &resource); err != nil {
			return ErrMalformedWebhook
		}
		orderID := resource.SupplementaryData.RelatedIDs.OrderID
		if orderID == "" {
			return ErrMalformedWebhook
		}
		order, err := getPaymentOrderByPaypalOrderIDAny(orderID)
		if err != nil {
			return err
		}
		return recordWebhookFailure(order.ID, order.OrgID, "capture_denied", "PayPal capture was denied")

	default:
		return nil
	}
}
