package payments

import (
	"reflect"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestPrepareLocalPaymentOrder(t *testing.T) {
	orgID, userID, programID := uuid.New(), uuid.New(), uuid.New()
	input := PrepareLocalPaymentOrderInput{OrganizationID: orgID, ParticipantID: userID, ProgramID: programID}
	paid := &paymentProgram{ID: programID, OrgID: orgID, Status: "active", IsOpen: true, PaymentRequired: true, PriceAmount: 49900, Currency: "INR"}
	fixedReceipt := func() string { return "po_test_receipt" }

	t.Run("paid program copies amount and currency from program", func(t *testing.T) {
		result, err := prepareLocalPaymentOrder(paid, input, false, nil, fixedReceipt)
		if err != nil {
			t.Fatal(err)
		}
		if result.Reused || result.Order.Amount != 49900 || result.Order.Currency != "INR" {
			t.Fatalf("unexpected order: %#v", result.Order)
		}
		if result.Order.Receipt != "po_test_receipt" {
			t.Fatalf("receipt = %q", result.Order.Receipt)
		}
	})
	t.Run("organization mismatch rejected", func(t *testing.T) {
		wrongOrg := *paid
		wrongOrg.OrgID = uuid.New()
		_, err := prepareLocalPaymentOrder(&wrongOrg, input, false, nil, fixedReceipt)
		if err != ErrOrganizationMismatch {
			t.Fatalf("error = %v", err)
		}
	})
	t.Run("free program rejected", func(t *testing.T) {
		free := *paid
		free.PaymentRequired = false
		_, err := prepareLocalPaymentOrder(&free, input, false, nil, fixedReceipt)
		if err != ErrPaymentNotRequired {
			t.Fatalf("error = %v", err)
		}
	})
	t.Run("already enrolled rejected", func(t *testing.T) {
		_, err := prepareLocalPaymentOrder(paid, input, true, nil, fixedReceipt)
		if err != ErrAlreadyEnrolled {
			t.Fatalf("error = %v", err)
		}
	})
	t.Run("active order is reused", func(t *testing.T) {
		existing := &PaymentOrder{ID: uuid.New(), Amount: 49900, Currency: "INR", Status: OrderStatusCreated}
		result, err := prepareLocalPaymentOrder(paid, input, false, existing, fixedReceipt)
		if err != nil || !result.Reused || result.Order != existing {
			t.Fatalf("result = %#v, err = %v", result, err)
		}
	})
}

func TestPrepareLocalPaymentOrderInputHasNoFinancialFields(t *testing.T) {
	typeOfInput := reflect.TypeOf(PrepareLocalPaymentOrderInput{})
	for _, forbidden := range []string{"amount", "price", "currency", "gst", "status"} {
		for i := 0; i < typeOfInput.NumField(); i++ {
			if strings.Contains(strings.ToLower(typeOfInput.Field(i).Name), forbidden) {
				t.Fatalf("input must not accept %q: %s", forbidden, typeOfInput.Field(i).Name)
			}
		}
	}
}

func TestPaymentReceiptIsUniqueAndNonSensitive(t *testing.T) {
	first, second := newPaymentReceipt(), newPaymentReceipt()
	if first == second || !strings.HasPrefix(first, "po_") {
		t.Fatalf("receipts are not unique: %q %q", first, second)
	}
	for _, forbidden := range []string{"razorpay", "secret", "@", "inr", "499"} {
		if strings.Contains(strings.ToLower(first), forbidden) {
			t.Fatalf("receipt leaks %q: %q", forbidden, first)
		}
	}
}

func TestValidatePaymentProgramPrice(t *testing.T) {
	base := paymentProgram{PaymentRequired: true, PriceAmount: 1, Currency: "INR"}
	tests := []struct {
		name   string
		mutate func(*paymentProgram)
		want   error
	}{
		{"valid minor units", func(p *paymentProgram) { p.PriceAmount = 49900 }, nil},
		{"free rejected", func(p *paymentProgram) { p.PaymentRequired = false }, ErrPaymentNotRequired},
		{"zero rejected", func(p *paymentProgram) { p.PriceAmount = 0 }, ErrInvalidProgramPrice},
		{"negative rejected", func(p *paymentProgram) { p.PriceAmount = -1 }, ErrInvalidProgramPrice},
		{"invalid currency rejected", func(p *paymentProgram) { p.Currency = "inr" }, ErrInvalidProgramPrice},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := base
			tt.mutate(&p)
			if err := validatePaymentProgramPrice(&p); err != tt.want {
				t.Fatalf("error = %v, want %v", err, tt.want)
			}
		})
	}
}

func TestPrepareLocalPaymentOrderRejectsUnavailableProgram(t *testing.T) {
	orgID, userID, programID := uuid.New(), uuid.New(), uuid.New()
	input := PrepareLocalPaymentOrderInput{OrganizationID: orgID, ParticipantID: userID, ProgramID: programID}
	for _, status := range []string{"draft", "archived"} {
		p := &paymentProgram{ID: programID, OrgID: orgID, Status: status, IsOpen: true, PaymentRequired: true, PriceAmount: 100, Currency: "INR"}
		if _, err := prepareLocalPaymentOrder(p, input, false, nil, newPaymentReceipt); err != ErrProgramNotFound {
			t.Fatalf("status %q: error = %v", status, err)
		}
	}
	p := &paymentProgram{ID: programID, OrgID: orgID, Status: "active", IsOpen: false, PaymentRequired: true, PriceAmount: 100, Currency: "INR"}
	if _, err := prepareLocalPaymentOrder(p, input, false, nil, newPaymentReceipt); err != ErrProgramNotFound {
		t.Fatalf("closed program: error = %v", err)
	}
}
