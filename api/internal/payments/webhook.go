package payments

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const maxWebhookBody = 512 * 1024

var (
	ErrInvalidWebhookSignature = errors.New("invalid webhook signature")
	ErrMalformedWebhook        = errors.New("malformed webhook payload")
)

type webhookEnvelope struct {
	Event   string `json:"event"`
	Payload struct {
		Order struct {
			Entity webhookOrder `json:"entity"`
		} `json:"order"`
		Payment struct {
			Entity webhookPayment `json:"entity"`
		} `json:"payment"`
	} `json:"payload"`
}
type webhookOrder struct {
	ID       string `json:"id"`
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
	Status   string `json:"status"`
}
type webhookPayment struct {
	ID               string `json:"id"`
	OrderID          string `json:"order_id"`
	Amount           int64  `json:"amount"`
	Currency         string `json:"currency"`
	Status           string `json:"status"`
	ErrorCode        string `json:"error_code"`
	ErrorDescription string `json:"error_description"`
}

func VerifyWebhookSignature(body []byte, signature, secret string) error {
	signature = strings.TrimSpace(signature)
	if len(body) == 0 || signature == "" || strings.TrimSpace(secret) == "" || len(signature) != sha256.Size*2 {
		return ErrInvalidWebhookSignature
	}
	provided, err := hex.DecodeString(signature)
	if err != nil || len(provided) != sha256.Size {
		return ErrInvalidWebhookSignature
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	if !hmac.Equal(provided, mac.Sum(nil)) {
		return ErrInvalidWebhookSignature
	}
	return nil
}

func (h *Handler) webhook(c echo.Context) error {
	config, err := h.loadConfig()
	if err != nil || config.WebhookSecret == "" {
		return shared.BadRequest(c, "WEBHOOK_UNAVAILABLE", "webhook is not configured", "")
	}
	body, err := io.ReadAll(io.LimitReader(c.Request().Body, maxWebhookBody+1))
	if err != nil || len(body) > maxWebhookBody {
		return shared.BadRequest(c, "INVALID_WEBHOOK", "invalid webhook body", "")
	}
	if err := VerifyWebhookSignature(body, c.Request().Header.Get("X-Razorpay-Signature"), config.WebhookSecret); err != nil {
		return shared.Unauthorized(c, "invalid webhook signature")
	}
	var payload webhookEnvelope
	if err := json.Unmarshal(body, &payload); err != nil || payload.Event == "" {
		return shared.BadRequest(c, "INVALID_WEBHOOK", "malformed webhook payload", "")
	}
	eventID := strings.TrimSpace(c.Request().Header.Get("X-Razorpay-Event-Id"))
	orderID, paymentID, amount, currency := webhookValues(payload)
	duplicate, event, err := persistWebhookEvent(payload.Event, eventID, orderID, paymentID, body)
	if err != nil {
		return shared.InternalError(c, "failed to record webhook")
	}
	if duplicate {
		return c.NoContent(http.StatusNoContent)
	}
	if err := processWebhookEvent(c, payload, orderID, paymentID, amount, currency); err != nil {
		_ = markWebhookEvent(event.ID, false, err.Error())
		return c.NoContent(http.StatusNoContent)
	}
	_ = markWebhookEvent(event.ID, true, "")
	return c.NoContent(http.StatusNoContent)
}

func webhookValues(payload webhookEnvelope) (string, string, int64, string) {
	order := payload.Payload.Order.Entity
	payment := payload.Payload.Payment.Entity
	orderID, amount, currency := order.ID, order.Amount, order.Currency
	if orderID == "" {
		orderID = payment.OrderID
	}
	if amount == 0 {
		amount = payment.Amount
	}
	if currency == "" {
		currency = payment.Currency
	}
	return orderID, payment.ID, amount, currency
}

func persistWebhookEvent(eventType, providerEventID, orderID, paymentID string, raw []byte) (bool, *PaymentEvent, error) {
	event := &PaymentEvent{ID: uuid.New(), Provider: "razorpay", EventType: eventType, RawPayload: append([]byte(nil), raw...), ReceivedAt: time.Now().UTC()}
	if providerEventID != "" {
		event.ProviderEventID = &providerEventID
	}
	if orderID != "" {
		event.ProviderOrderID = &orderID
	}
	if paymentID != "" {
		event.ProviderPaymentID = &paymentID
	}
	var duplicate bool
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if orderID != "" {
			var local PaymentOrder
			if err := tx.Where("provider_order_id = ?", orderID).First(&local).Error; err == nil {
				event.OrgID = &local.OrgID
			}
		}
		if event.ProviderEventID != nil {
			var existing PaymentEvent
			err := tx.Where("provider = ? AND provider_event_id = ?", event.Provider, providerEventID).First(&existing).Error
			if err == nil {
				duplicate, event = true, &existing
				return nil
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(event)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 && event.ProviderEventID != nil {
			var existing PaymentEvent
			if err := tx.Where("provider = ? AND provider_event_id = ?", event.Provider, providerEventID).First(&existing).Error; err != nil {
				return err
			}
			duplicate, event = true, &existing
		}
		return nil
	})
	return duplicate, event, err
}
func markWebhookEvent(id uuid.UUID, processed bool, processingErr string) error {
	status := "processed"
	if !processed {
		status = "failed"
	}
	updates := map[string]any{"processed": processed, "processing_status": status, "processed_at": time.Now().UTC()}
	if processingErr != "" {
		updates["processing_error"] = processingErr
	}
	return database.DB.Model(&PaymentEvent{}).Where("id = ?", id).Updates(updates).Error
}

func processWebhookEvent(c echo.Context, payload webhookEnvelope, orderID, paymentID string, amount int64, currency string) error {
	switch payload.Event {
	case "order.paid", "payment.captured":
		if orderID == "" || paymentID == "" || amount <= 0 || currency == "" {
			return ErrMalformedWebhook
		}
		order, err := getPaymentOrderByProviderOrderIDAny(orderID)
		if err != nil {
			return err
		}
		return func() error {
			_, err := FinalizePaidOrder(c.Request().Context(), FinalizePaidOrderInput{OrganizationID: order.OrgID, ParticipantID: order.UserID, PaymentOrderID: order.ID, ProviderOrderID: orderID, ProviderPaymentID: paymentID, ProviderAmount: amount, ProviderCurrency: currency})
			return err
		}()
	case "payment.failed":
		if orderID == "" {
			return ErrMalformedWebhook
		}
		order, err := getPaymentOrderByProviderOrderIDAny(orderID)
		if err != nil {
			return err
		}
		code := payload.Payload.Payment.Entity.ErrorCode
		if code == "" {
			code = "payment_failed"
		}
		description := payload.Payload.Payment.Entity.ErrorDescription
		if description == "" {
			description = "payment failed"
		}
		return recordWebhookFailure(order.ID, order.OrgID, code, description)
	default:
		return nil
	}
}

func recordWebhookFailure(orderID, orgID uuid.UUID, code, description string) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		var order PaymentOrder
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND org_id = ?", orderID, orgID).First(&order).Error; err != nil {
			return err
		}
		if order.Status == OrderStatusPaid || order.EnrolledAt != nil {
			return nil
		}
		return tx.Model(&PaymentOrder{}).Where("id = ? AND org_id = ?", orderID, orgID).Updates(map[string]any{"status": OrderStatusFailed, "failure_code": code, "failure_description": description}).Error
	})
}
