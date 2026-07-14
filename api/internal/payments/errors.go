package payments

import "errors"

var (
	ErrProgramNotFound             = errors.New("program not found")
	ErrPaymentNotRequired          = errors.New("payment is not required for this program")
	ErrInvalidProgramPrice         = errors.New("program price is invalid")
	ErrAlreadyEnrolled             = errors.New("participant is already enrolled in this program")
	ErrActivePaymentOrderExists    = errors.New("an active payment order already exists")
	ErrOrganizationMismatch        = errors.New("organization mismatch")
	ErrPaymentOrderNotFound        = errors.New("payment order not found")
	ErrProviderOrderCreationFailed = errors.New("payment provider order creation failed")
	ErrProviderOrderMismatch       = errors.New("provider order does not match local order")

	ErrPaymentNotCaptured = errors.New("payment is not captured")
)
