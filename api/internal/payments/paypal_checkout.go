package payments

import (
	"context"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/payments/paypal"
	"gorm.io/gorm"
)

type PaypalCheckoutPaymentOrder struct {
	InternalOrderID string `json:"payment_order_id"`
	Provider        string `json:"provider"`
	PaypalOrderID   string `json:"paypal_order_id"`
	Amount          int64  `json:"amount"`
	Currency        string `json:"currency"`
	CatalogAmount   int64  `json:"catalog_amount"`
	CatalogCurrency string `json:"catalog_currency"`
	ExchangeRate    string `json:"exchange_rate"`
	ProgramID       string `json:"program_id"`
	ProgramName     string `json:"program_name"`
}

// CreatePaypalCheckoutPaymentOrder keeps catalog pricing in INR but creates a
// USD PayPal order. PayPal then handles any buyer-side USD-to-local conversion.
func CreatePaypalCheckoutPaymentOrder(ctx context.Context, participantID, programID uuid.UUID, client paypal.Client) (*PaypalCheckoutPaymentOrder, error) {
	local, program, err := prepareOpenProgramLocalOrder(ctx, participantID, programID, "paypal")
	if err != nil {
		return nil, err
	}
	if local.PaypalOrderID != nil && *local.PaypalOrderID != "" {
		return paypalCheckoutResponse(local, program), nil
	}
	catalogAmount, catalogCurrency := local.Amount, local.Currency
	usdCents, rate, err := paypal.INRMinorToUSDMinor(ctx, catalogAmount, nil)
	if err != nil {
		return nil, err
	}
	if err := withinPaymentTransaction(func(tx *gorm.DB) error {
		return updatePaypalSettlement(tx, local.OrgID, local.ID, usdCents, "USD", catalogAmount, catalogCurrency, rate)
	}); err != nil {
		return nil, err
	}
	local.Amount, local.Currency = usdCents, "USD"
	providerOrder, err := client.CreateOrder(ctx, paypal.CreateOrderRequest{AmountMinorUnits: local.Amount, Currency: local.Currency, ReferenceID: local.ID.String()})
	if err != nil || providerOrder.ID == "" {
		_ = withinPaymentTransaction(func(tx *gorm.DB) error {
			return recordPaymentFailure(tx, local.OrgID, local.ID, "provider_order_create_failed", "payment provider order creation failed")
		})
		if err != nil {
			return nil, err
		}
		return nil, ErrProviderOrderCreationFailed
	}
	if err := withinPaymentTransaction(func(tx *gorm.DB) error { return updatePaypalOrderID(tx, local.OrgID, local.ID, providerOrder.ID) }); err != nil {
		return nil, err
	}
	local.PaypalOrderID = &providerOrder.ID
	return paypalCheckoutResponse(local, program), nil
}

func paypalCheckoutResponse(order *PaymentOrder, program *paymentProgram) *PaypalCheckoutPaymentOrder {
	return &PaypalCheckoutPaymentOrder{InternalOrderID: order.ID.String(), Provider: "paypal", PaypalOrderID: deref(order.PaypalOrderID), Amount: order.Amount, Currency: order.Currency, CatalogAmount: order.CatalogAmount, CatalogCurrency: order.CatalogCurrency, ExchangeRate: deref(order.ExchangeRate), ProgramID: order.ProgramID.String(), ProgramName: program.Title}
}

type CapturePaypalOrderResult struct {
	Status string `json:"status"`
}

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
