package programs

import (
	"github.com/google/uuid"
	"testing"
)

func TestValidatePublicSelfEnrollment(t *testing.T) {
	orgID := uuid.New()
	tests := []struct {
		name    string
		program Program
		want    error
	}{
		{"free program succeeds", Program{OrgID: orgID}, nil},
		{"paid program requires payment", Program{OrgID: orgID, PaymentRequired: true, PriceAmount: 100}, ErrPaymentRequired},
		{"paid program with zero price fails safely", Program{OrgID: orgID, PaymentRequired: true}, ErrInvalidPaidProgramPrice},
		{"program from a different org still succeeds using its own org", Program{OrgID: uuid.New()}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := validatePublicSelfEnrollment(tt.program); got != tt.want {
				t.Fatalf("error = %v, want %v", got, tt.want)
			}
		})
	}
}
