package payments

import (
	"context"
	"errors"

	"github.com/google/uuid"
)

var (
	ErrPaymentOrderOrganization = errors.New("payment order is not in participant organization")
	ErrCheckoutPaymentNotFound  = errors.New("checkout payment not found")
)

type VerifyCheckoutInput struct {
	ParticipantID     uuid.UUID
	ProviderOrderID   string
	ProviderPaymentID string
	Signature         string
}

// VerifyAndFinalizeCheckout performs all provider checks before the short,
// transactional finalization step. Browser input is limited to provider IDs
// and the signature; all financial and tenant fields come from the local order.
func VerifyAndFinalizeCheckout(ctx context.Context, input VerifyCheckoutInput, secret string, client RazorpayClient) (*FinalizePaidOrderResult, error) {
	order, err := getPaymentOrderForParticipant(input.ProviderOrderID, input.ParticipantID)
	if err != nil {
		return nil, err
	}
	belongs, err := participantBelongsToOrganization(order.OrgID, input.ParticipantID)
	if err != nil {
		return nil, err
	}
	if !belongs {
		return nil, ErrPaymentOrderOrganization
	}
	if err := VerifyCheckoutSignature(input.ProviderOrderID, input.ProviderPaymentID, input.Signature, secret); err != nil {
		return nil, err
	}
	if client == nil {
		return nil, ErrProviderOrderCreationFailed
	}
	providerOrder, err := client.GetOrder(ctx, input.ProviderOrderID)
	if err != nil {
		return nil, err
	}
	providerPayment, err := client.GetPayment(ctx, input.ProviderPaymentID)
	if err != nil {
		return nil, err
	}
	if providerOrder.ID != input.ProviderOrderID || providerPayment.ID != input.ProviderPaymentID || providerPayment.OrderID != input.ProviderOrderID {
		return nil, ErrProviderOrderMismatch
	}
	if providerOrder.Amount != order.Amount || providerPayment.Amount != order.Amount {
		return nil, ErrProviderAmountMismatch
	}
	if providerOrder.Currency != order.Currency || providerPayment.Currency != order.Currency {
		return nil, ErrProviderCurrencyMismatch
	}
	if providerPayment.Status != "captured" && providerOrder.Status != "paid" {
		return nil, ErrPaymentNotCaptured
	}
	return FinalizePaidOrder(ctx, FinalizePaidOrderInput{OrganizationID: order.OrgID, ParticipantID: input.ParticipantID, PaymentOrderID: order.ID, ProviderOrderID: input.ProviderOrderID, ProviderPaymentID: input.ProviderPaymentID, ProviderAmount: order.Amount, ProviderCurrency: order.Currency})
}
