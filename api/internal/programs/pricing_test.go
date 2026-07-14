package programs

import "testing"

func TestValidateProgramPricing(t *testing.T) {
	tests := []struct {
		name string
		p    Program
		want string
	}{
		{name: "free program", p: Program{Currency: "INR"}},
		{name: "paid program", p: Program{PaymentRequired: true, PriceAmount: 49900, Currency: "INR"}},
		{name: "negative price", p: Program{PriceAmount: -1, Currency: "INR"}, want: "price_amount must be non-negative"},
		{name: "negative GST", p: Program{Currency: "INR", GSTRateBPS: -1}, want: "gst_rate_bps must be non-negative"},
		{name: "invalid currency", p: Program{Currency: "inr"}, want: "currency must be a three-letter uppercase ISO code"},
		{name: "paid without price", p: Program{PaymentRequired: true, Currency: "INR"}, want: "price_amount must be greater than zero when payment is required"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateProgramPricing(&test.p)
			if test.want == "" && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if test.want != "" && (err == nil || err.Error() != test.want) {
				t.Fatalf("error = %v, want %q", err, test.want)
			}
		})
	}
}
