package payments

import "testing"

func TestSelectProviderDefaultsToRazorpayForINRPricing(t *testing.T) {
	if got := SelectProvider("INR"); got != "razorpay" {
		t.Fatalf("SelectProvider(\"INR\") = %q, want razorpay", got)
	}
}

func TestResolveProviderAllowsPayPalForINRInternationalCheckout(t *testing.T) {
	for _, tt := range []struct {
		name, requested, want string
	}{
		{"default", "", "razorpay"},
		{"paypal is an explicit option", "paypal", "paypal"},
		{"razorpay is an explicit option", "razorpay", "razorpay"},
		{"invalid option uses default", "garbage", "razorpay"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := resolveProvider(tt.requested, "INR"); got != tt.want {
				t.Fatalf("resolveProvider(%q, INR) = %q, want %q", tt.requested, got, tt.want)
			}
		})
	}
}
