package payments

// SelectProvider is the default payment route. Program prices are always INR.
func SelectProvider(_ string) string {
	return "razorpay"
}
