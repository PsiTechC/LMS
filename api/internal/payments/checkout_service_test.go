package payments

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/google/uuid"
	"strings"
	"testing"
)

type fakeRazorpay struct {
	request RazorpayOrderRequest
	err     error
}

func (f *fakeRazorpay) CreateOrder(_ context.Context, request RazorpayOrderRequest) (RazorpayOrder, error) {
	f.request = request
	if f.err != nil {
		return RazorpayOrder{}, f.err
	}
	return RazorpayOrder{ID: "order_test", Amount: request.Amount, Currency: request.Currency, Receipt: request.Receipt}, nil
}
func (f *fakeRazorpay) GetOrder(context.Context, string) (RazorpayOrder, error) {
	return RazorpayOrder{}, nil
}
func (f *fakeRazorpay) GetPayment(context.Context, string) (RazorpayPayment, error) {
	return RazorpayPayment{}, nil
}
func TestCreateRazorpayOrderUsesLocalFinancialValues(t *testing.T) {
	local := &PaymentOrder{ID: uuid.New(), ProgramID: uuid.New(), Amount: 49900, Currency: "INR", Receipt: "po_test"}
	fake := &fakeRazorpay{}
	_, err := createRazorpayOrder(context.Background(), fake, local)
	if err != nil {
		t.Fatal(err)
	}
	if fake.request.Amount != 49900 || fake.request.Currency != "INR" {
		t.Fatalf("request = %#v", fake.request)
	}
	if fake.request.Notes["payment_order_id"] != local.ID.String() || fake.request.Notes["program_id"] != local.ProgramID.String() {
		t.Fatal("missing safe notes")
	}
}
func TestCreateRazorpayOrderFailure(t *testing.T) {
	local := &PaymentOrder{ID: uuid.New(), ProgramID: uuid.New(), Amount: 100, Currency: "INR", Receipt: "po_test"}
	_, err := createRazorpayOrder(context.Background(), &fakeRazorpay{err: errors.New("upstream")}, local)
	if err == nil {
		t.Fatal("expected provider error")
	}
}
func TestCheckoutResponseContainsPublicValuesOnly(t *testing.T) {
	order := &PaymentOrder{ID: uuid.New(), ProgramID: uuid.New(), Amount: 100, Currency: "INR"}
	provider := "order_public"
	order.ProviderOrderID = &provider
	response := checkoutResponse(order, &paymentProgram{Title: "Program"}, "rzp_public")
	if response.KeyID != "rzp_public" || response.RazorpayOrderID == "" {
		t.Fatal("missing checkout data")
	}
	serialized, _ := json.Marshal(response)
	if strings.Contains(strings.ToLower(string(serialized)), "secret") {
		t.Fatalf("secret exposed in checkout response: %s", serialized)
	}
}
