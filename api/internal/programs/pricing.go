package programs

import (
	"errors"
)

const programCurrency = "INR"

// validateProgramPricing keeps pricing valid before a Program reaches the
// database. Amounts are stored in minor currency units to avoid float errors.
func validateProgramPricing(p *Program) error {
	if p.PriceAmount < 0 {
		return errors.New("price_amount must be non-negative")
	}
	if p.GSTRateBPS < 0 {
		return errors.New("gst_rate_bps must be non-negative")
	}
	if p.Currency != programCurrency {
		return errors.New("currency must be INR")
	}
	if p.PaymentRequired && p.PriceAmount == 0 {
		return errors.New("price_amount must be greater than zero when payment is required")
	}
	return nil
}
