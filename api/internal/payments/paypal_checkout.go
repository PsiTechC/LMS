package payments

import (
	"context"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/payments/paypal"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// PaypalCheckoutPaymentOrder is the paypal counterpart to
// CheckoutPaymentOrder (checkout_service.go) — kept as its own response type,
// not a shared struct, so the frontend can branch on the "provider" field
// per-shape rather than guessing from optional fields.
type PaypalCheckoutPaymentOrder struct {
	InternalOrderID string `json:"payment_order_id"`
	Provider        string `json:"provider"` // always "paypal"
	PaypalOrderID   string `json:"paypal_order_id"`
	Amount          int64  `json:"amount"`
	Currency        string `json:"currency"`
	ProgramID       string `json:"program_id"`
	ProgramName     string `json:"program_name"`
}

// CreatePaypalCheckoutPaymentOrder mirrors CreateCheckoutPaymentOrder's
// shape exactly (commit local order first, external call outside any DB
// transaction, reuse an existing provider order rather than recreating it)
// but against the PayPal client instead of Razorpay's.
func CreatePaypalCheckoutPaymentOrder(ctx context.Context, participantID, programID uuid.UUID, client paypal.Client) (*PaypalCheckoutPaymentOrder, error) {
	local, program, err := prepareOpenProgramLocalOrder(ctx, participantID, programID, "paypal")
	if err != nil {
		return nil, err
	}
	if local.PaypalOrderID != nil && *local.PaypalOrderID != "" {
		return paypalCheckoutResponse(local, program), nil
	}
	providerOrder, err := client.CreateOrder(ctx, paypal.CreateOrderRequest{
		AmountMinorUnits: local.Amount,
		Currency:         local.Currency,
		ReferenceID:      local.ID.String(),
	})
	if err != nil || providerOrder.ID == "" {
		_ = withinPaymentTransaction(func(tx *gorm.DB) error {
			return recordPaymentFailure(tx, local.OrgID, local.ID, "provider_order_create_failed", "payment provider order creation failed")
		})
		if err != nil {
			return nil, err
		}
		return nil, ErrProviderOrderCreationFailed
	}
	if err := withinPaymentTransaction(func(tx *gorm.DB) error {
		return updatePaypalOrderID(tx, local.OrgID, local.ID, providerOrder.ID)
	}); err != nil {
		return nil, err
	}
	local.PaypalOrderID = &providerOrder.ID
	return paypalCheckoutResponse(local, program), nil
}

func paypalCheckoutResponse(order *PaymentOrder, program *paymentProgram) *PaypalCheckoutPaymentOrder {
	return &PaypalCheckoutPaymentOrder{
		InternalOrderID: order.ID.String(),
		Provider:        "paypal",
		PaypalOrderID:   deref(order.PaypalOrderID),
		Amount:          order.Amount,
		Currency:        order.Currency,
		ProgramID:       order.ProgramID.String(),
		ProgramName:     program.Title,
	}
}

// CapturePaypalOrderResult is deliberately minimal — this endpoint never
// finalizes/enrolls (see CapturePaypalOrder's doc comment).
type CapturePaypalOrderResult struct {
	Status string `json:"status"`
}

// CapturePaypalOrder triggers the real PayPal capture server-side — the
// frontend's onApprove callback is never trusted alone, it only tells us the
// buyer finished the PayPal popup. This function does NOT call
// FinalizePaidOrder: the PAYMENT.CAPTURE.COMPLETED webhook
// (paypal_webhook.go, Phase 4) remains the sole source of truth for
// marking the order paid and enrolling the participant, so this endpoint
// only triggers the charge and reports its immediate status back — the
// frontend polls GetPaymentOrderStatusForParticipant until the webhook has
// finished, the same "browser closed" resilience pattern already relied on
// for Razorpay (whose synchronous verify endpoint calls FinalizePaidOrder
// directly, with the webhook only as an idempotent backstop — PayPal's
// asynchronous-only design here is intentionally more conservative).
func CapturePaypalOrder(ctx context.Context, participantID, paymentOrderID uuid.UUID, client paypal.Client) (*CapturePaypalOrderResult, error) {
	order, err := getPaymentOrderByIDForParticipant(paymentOrderID, participantID)
	if err != nil {
		return nil, err
	}
	if order.Provider != "paypal" || order.PaypalOrderID == nil || *order.PaypalOrderID == "" {
		return nil, ErrProviderOrderMismatch
	}
	capture, err := client.CaptureOrder(ctx, *order.PaypalOrderID)
	if err != nil {
		return nil, err
	}
	return &CapturePaypalOrderResult{Status: capture.Status}, nil
}

// PaymentOrderStatusDTO is a lightweight, provider-agnostic status read for
// the frontend to poll after triggering a PayPal capture, until the webhook
// finalizes the order (Enrolled flips true once EnrolledAt is set).
type PaymentOrderStatusDTO struct {
	Status   string `json:"status"`
	Enrolled bool   `json:"enrolled"`
}

func GetPaymentOrderStatusForParticipant(paymentOrderID, participantID uuid.UUID) (*PaymentOrderStatusDTO, error) {
	order, err := getPaymentOrderByIDForParticipant(paymentOrderID, participantID)
	if err != nil {
		return nil, err
	}
	return &PaymentOrderStatusDTO{Status: order.Status, Enrolled: order.EnrolledAt != nil}, nil
}

// getProgramCurrency is a lightweight, non-locking read used only to decide
// which provider to dispatch to (see handler.go's createPaymentOrder) before
// prepareOpenProgramLocalOrder's transactional path runs — the same program
// row prepareLocalPaymentOrder later re-reads (with a row lock) and stamps
// via SelectProvider, so this pre-check and the actual stored Provider can
// never disagree for the same currency value.
func getProgramCurrency(programID uuid.UUID) (string, error) {
	var currency string
	err := database.DB.Table("programs").Select("currency").Where("id = ?", programID).Scan(&currency).Error
	if err != nil {
		return "", err
	}
	if currency == "" {
		return "", ErrProgramNotFound
	}
	return currency, nil
}
