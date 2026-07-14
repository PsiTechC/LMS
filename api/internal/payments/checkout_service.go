package payments

import (
	"context"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

type CheckoutPaymentOrder struct {
	InternalOrderID string `json:"payment_order_id"`
	RazorpayOrderID string `json:"razorpay_order_id"`
	KeyID           string `json:"razorpay_key_id"`
	Amount          int64  `json:"amount"`
	Currency        string `json:"currency"`
	ProgramID       string `json:"program_id"`
	ProgramName     string `json:"program_name"`
}

// CreateCheckoutPaymentOrder commits a local order before calling Razorpay.
// The external request therefore never runs while a database transaction is open.
func CreateCheckoutPaymentOrder(ctx context.Context, participantID, programID uuid.UUID, client RazorpayClient, keyID string) (*CheckoutPaymentOrder, error) {
	local, program, err := prepareOpenProgramLocalOrder(ctx, participantID, programID)
	if err != nil {
		return nil, err
	}
	// A provider order is only reusable while it was created under the
	// currently-configured Razorpay key. If the key has since been rotated,
	// the stored provider_order_id belongs to a different Razorpay account/key
	// pair and Razorpay will reject Checkout for it — create a fresh one instead.
	if local.ProviderOrderID != nil && *local.ProviderOrderID != "" && local.ProviderKeyID != nil && *local.ProviderKeyID == keyID {
		return checkoutResponse(local, program, keyID), nil
	}
	providerOrder, err := createRazorpayOrder(ctx, client, local)
	if err != nil || providerOrder.ID == "" || providerOrder.Amount != local.Amount || providerOrder.Currency != local.Currency || providerOrder.Receipt != local.Receipt {
		_ = withinPaymentTransaction(func(tx *gorm.DB) error {
			return recordPaymentFailure(tx, local.OrgID, local.ID, "provider_order_create_failed", "payment provider order creation failed")
		})
		if err != nil {
			return nil, err
		}
		return nil, ErrProviderOrderCreationFailed
	}
	if err := withinPaymentTransaction(func(tx *gorm.DB) error { return updateProviderOrderID(tx, local.OrgID, local.ID, providerOrder.ID, keyID) }); err != nil {
		return nil, err
	}
	local.ProviderOrderID = &providerOrder.ID
	local.ProviderKeyID = &keyID
	return checkoutResponse(local, program, keyID), nil
}

func createRazorpayOrder(ctx context.Context, client RazorpayClient, local *PaymentOrder) (RazorpayOrder, error) {
	providerOrder, err := client.CreateOrder(ctx, RazorpayOrderRequest{Amount: local.Amount, Currency: local.Currency, Receipt: local.Receipt, Notes: map[string]string{"payment_order_id": local.ID.String(), "program_id": local.ProgramID.String()}})
	if err != nil {
		return RazorpayOrder{}, err
	}
	if providerOrder.ID == "" || providerOrder.Amount != local.Amount || providerOrder.Currency != local.Currency || providerOrder.Receipt != local.Receipt {
		return RazorpayOrder{}, ErrProviderOrderCreationFailed
	}
	return providerOrder, nil
}
func checkoutResponse(order *PaymentOrder, program *paymentProgram, keyID string) *CheckoutPaymentOrder {
	return &CheckoutPaymentOrder{InternalOrderID: order.ID.String(), RazorpayOrderID: deref(order.ProviderOrderID), KeyID: keyID, Amount: order.Amount, Currency: order.Currency, ProgramID: order.ProgramID.String(), ProgramName: program.Title}
}
func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func prepareOpenProgramLocalOrder(ctx context.Context, participantID, programID uuid.UUID) (*PaymentOrder, *paymentProgram, error) {
	var order *PaymentOrder
	var programOut *paymentProgram
	err := database.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		program, err := loadPaymentProgramForUpdate(tx, programID)
		if err != nil {
			return err
		}
		input := PrepareLocalPaymentOrderInput{OrganizationID: program.OrgID, ParticipantID: participantID, ProgramID: programID}
		enrolled, err := participantAlreadyEnrolled(tx, program.OrgID, participantID, programID)
		if err != nil {
			return err
		}
		existing, err := findActivePaymentOrder(tx, program.OrgID, participantID, programID)
		if err != nil {
			return err
		}
		prepared, err := prepareLocalPaymentOrder(program, input, enrolled, existing, newPaymentReceipt)
		if err != nil {
			return err
		}
		if !prepared.Reused {
			if err := createPaymentOrder(tx, prepared.Order); err != nil {
				return err
			}
		}
		order, programOut = prepared.Order, program
		return nil
	})
	return order, programOut, err
}
