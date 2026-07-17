package paypal

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// ErrInvalidAmount is returned by ParseAmount when the decimal string PayPal
// sent doesn't parse cleanly against the currency's expected decimal places.
var ErrInvalidAmount = errors.New("invalid paypal amount")

// zeroDecimalCurrencies are the currencies PayPal itself documents as having
// no decimal places (https://developer.paypal.com/api/rest/reference/currency-codes/)
// — everything else PayPal supports uses 2 decimal places. PayPal does not
// support any of the (rarer) 3-decimal ISO 4217 currencies (BHD, KWD, OMR...),
// so this list is exhaustive for PayPal's purposes, not a general ISO 4217
// mapping.
var zeroDecimalCurrencies = map[string]bool{
	"HUF": true,
	"JPY": true,
	"TWD": true,
}

// decimalPlacesForCurrency returns how many minor-unit decimal places the
// given currency uses for PayPal's API.
func decimalPlacesForCurrency(currency string) int {
	if zeroDecimalCurrencies[strings.ToUpper(currency)] {
		return 0
	}
	return 2
}

// FormatAmount converts a minor-unit integer amount — the same convention
// PaymentOrder.Amount already stores things in (e.g. paise for INR, cents for
// USD; see model.go) — into the decimal string PayPal's API requires (e.g.
// "49.99"), respecting each currency's decimal-place count. This is the
// PayPal-specific step Razorpay doesn't need: Razorpay takes the same minor-
// unit integer directly, no conversion.
//
// Getting this wrong is a common real bug: a currency with 0 decimal places
// (JPY, HUF, TWD) must NOT be divided by 100 — amountMinorUnits for those
// currencies IS already the major-unit amount.
func FormatAmount(amountMinorUnits int64, currency string) string {
	places := decimalPlacesForCurrency(currency)
	if places == 0 {
		return strconv.FormatInt(amountMinorUnits, 10)
	}

	negative := amountMinorUnits < 0
	abs := amountMinorUnits
	if negative {
		abs = -abs
	}
	divisor := int64(1)
	for i := 0; i < places; i++ {
		divisor *= 10
	}
	whole := abs / divisor
	frac := abs % divisor

	sign := ""
	if negative {
		sign = "-"
	}
	return fmt.Sprintf("%s%d.%0*d", sign, whole, places, frac)
}

// ParseAmount is the inverse of FormatAmount — converts a decimal string as
// PayPal sends it in webhook payloads (e.g. "49.99", or "5000" for a
// zero-decimal currency) back into the minor-unit integer this system
// stores everywhere (see model.go's PaymentOrder.Amount), so a webhook's
// reported amount can be compared against the locally stored order amount.
func ParseAmount(value, currency string) (int64, error) {
	places := decimalPlacesForCurrency(currency)
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, ErrInvalidAmount
	}

	negative := strings.HasPrefix(value, "-")
	if negative {
		value = value[1:]
	}

	if places == 0 {
		if strings.Contains(value, ".") {
			return 0, ErrInvalidAmount
		}
		whole, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return 0, ErrInvalidAmount
		}
		if negative {
			whole = -whole
		}
		return whole, nil
	}

	wholePart, fracPart, hasFrac := strings.Cut(value, ".")
	if !hasFrac {
		fracPart = ""
	}
	if len(fracPart) > places {
		return 0, ErrInvalidAmount
	}
	fracPart += strings.Repeat("0", places-len(fracPart))

	whole, err := strconv.ParseInt(wholePart, 10, 64)
	if err != nil {
		return 0, ErrInvalidAmount
	}
	frac, err := strconv.ParseInt(fracPart, 10, 64)
	if err != nil {
		return 0, ErrInvalidAmount
	}

	divisor := int64(1)
	for i := 0; i < places; i++ {
		divisor *= 10
	}
	total := whole*divisor + frac
	if negative {
		total = -total
	}
	return total, nil
}
