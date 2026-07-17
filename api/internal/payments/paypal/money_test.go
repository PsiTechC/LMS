package paypal

import "testing"

func TestFormatAmount(t *testing.T) {
	for _, tt := range []struct {
		name             string
		amountMinorUnits int64
		currency         string
		want             string
	}{
		{"USD two decimals", 4999, "USD", "49.99"},
		{"EUR two decimals", 100, "EUR", "1.00"},
		{"INR two decimals, amount under 1 rupee", 50, "INR", "0.50"},
		{"lowercase currency code still recognized", 4999, "usd", "49.99"},

		// The bug this function exists to prevent: JPY must NOT be divided
		// by 100 — a program priced at 5000 (stored the same way any other
		// currency's minor-unit amount is stored) must come out as "5000",
		// not "50.00".
		{"JPY zero decimals", 5000, "JPY", "5000"},
		{"HUF zero decimals", 12345, "HUF", "12345"},
		{"TWD zero decimals", 999, "TWD", "999"},

		{"exact whole amount, two-decimal currency", 5000, "USD", "50.00"},
		{"single minor unit", 1, "USD", "0.01"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got := FormatAmount(tt.amountMinorUnits, tt.currency)
			if got != tt.want {
				t.Fatalf("FormatAmount(%d, %q) = %q, want %q", tt.amountMinorUnits, tt.currency, got, tt.want)
			}
		})
	}
}

// TestParseAmount is FormatAmount's inverse — needed to compare a webhook's
// reported capture amount (a decimal string) against the locally stored
// minor-unit amount.
func TestParseAmount(t *testing.T) {
	for _, tt := range []struct {
		name     string
		value    string
		currency string
		want     int64
	}{
		{"USD two decimals", "49.99", "USD", 4999},
		{"EUR whole amount", "1.00", "EUR", 100},
		{"INR under 1 rupee", "0.50", "INR", 50},
		{"lowercase currency", "49.99", "usd", 4999},
		{"JPY zero decimals", "5000", "JPY", 5000},
		{"HUF zero decimals", "12345", "HUF", 12345},
		{"single minor unit", "0.01", "USD", 1},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseAmount(tt.value, tt.currency)
			if err != nil {
				t.Fatal(err)
			}
			if got != tt.want {
				t.Fatalf("ParseAmount(%q, %q) = %d, want %d", tt.value, tt.currency, got, tt.want)
			}
		})
	}
}

func TestParseAmountRoundTripsWithFormatAmount(t *testing.T) {
	for _, tt := range []struct {
		amount   int64
		currency string
	}{
		{4999, "USD"}, {100, "EUR"}, {50, "INR"}, {5000, "JPY"}, {1, "USD"}, {0, "USD"},
	} {
		formatted := FormatAmount(tt.amount, tt.currency)
		got, err := ParseAmount(formatted, tt.currency)
		if err != nil {
			t.Fatalf("ParseAmount(%q, %q): %v", formatted, tt.currency, err)
		}
		if got != tt.amount {
			t.Fatalf("round-trip: FormatAmount(%d, %q) = %q, ParseAmount back = %d", tt.amount, tt.currency, formatted, got)
		}
	}
}

func TestParseAmountRejectsMalformed(t *testing.T) {
	for _, tt := range []struct{ value, currency string }{
		{"", "USD"},
		{"abc", "USD"},
		{"49.999", "USD"}, // too many decimal places for a 2-decimal currency
		{"49.99", "JPY"},  // decimals on a zero-decimal currency
	} {
		if _, err := ParseAmount(tt.value, tt.currency); err == nil {
			t.Fatalf("ParseAmount(%q, %q) accepted, want rejection", tt.value, tt.currency)
		}
	}
}
