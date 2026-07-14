package payments

import (
	"errors"
	"regexp"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var paymentCurrencyCode = regexp.MustCompile(`^[A-Z]{3}$`)

// PrepareLocalPaymentOrderInput deliberately contains only authenticated
// context and the selected program. Financial values are never client input.
type PrepareLocalPaymentOrderInput struct {
	OrganizationID uuid.UUID
	ParticipantID  uuid.UUID
	ProgramID      uuid.UUID
}

type PrepareLocalPaymentOrderResult struct {
	Order  *PaymentOrder
	Reused bool
}

type paymentProgram struct {
	ID              uuid.UUID
	Title           string
	OrgID           uuid.UUID
	Status          string
	IsOpen          bool
	PaymentRequired bool
	PriceAmount     int64
	Currency        string
}

// PrepareLocalPaymentOrderService creates the local order before any provider
// call. Retry policy: a created/attempted/provider-created order is reused; a
// later provider phase may cancel failed orders before creating a replacement.
func PrepareLocalPaymentOrderService(input PrepareLocalPaymentOrderInput) (*PrepareLocalPaymentOrderResult, error) {
	var result *PrepareLocalPaymentOrderResult
	err := withinPaymentTransaction(func(tx *gorm.DB) error {
		program, err := loadPaymentProgramForUpdate(tx, input.ProgramID)
		if err != nil {
			return err
		}
		enrolled, err := participantAlreadyEnrolled(tx, input.OrganizationID, input.ParticipantID, input.ProgramID)
		if err != nil {
			return err
		}
		existing, err := findActivePaymentOrder(tx, input.OrganizationID, input.ParticipantID, input.ProgramID)
		if err != nil {
			return err
		}
		prepared, err := prepareLocalPaymentOrder(program, input, enrolled, existing, newPaymentReceipt)
		if err != nil {
			return err
		}
		if prepared.Reused {
			result = prepared
			return nil
		}
		if err := createPaymentOrder(tx, prepared.Order); err != nil {
			return err
		}
		result = prepared
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func prepareLocalPaymentOrder(program *paymentProgram, input PrepareLocalPaymentOrderInput, enrolled bool, existing *PaymentOrder, receipt func() string) (*PrepareLocalPaymentOrderResult, error) {
	if program.OrgID != input.OrganizationID {
		return nil, ErrOrganizationMismatch
	}
	if program.Status != "active" || !program.IsOpen {
		return nil, ErrProgramNotFound
	}
	if err := validatePaymentProgramPrice(program); err != nil {
		return nil, err
	}
	if enrolled {
		return nil, ErrAlreadyEnrolled
	}
	if existing != nil {
		return &PrepareLocalPaymentOrderResult{Order: existing, Reused: true}, nil
	}
	return &PrepareLocalPaymentOrderResult{Order: &PaymentOrder{
		OrgID: input.OrganizationID, UserID: input.ParticipantID, ProgramID: input.ProgramID,
		Provider: "razorpay", Amount: program.PriceAmount, Currency: program.Currency,
		Status: OrderStatusCreated, Receipt: receipt(),
	}}, nil
}

func loadPaymentProgramForUpdate(tx *gorm.DB, programID uuid.UUID) (*paymentProgram, error) {
	var program paymentProgram
	err := tx.Table("programs").Clauses(clause.Locking{Strength: "UPDATE"}).Select("id, title, org_id, status, is_open, payment_required, price_amount, currency").Where("id = ?", programID).First(&program).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrProgramNotFound
	}
	return &program, err
}

func participantAlreadyEnrolled(tx *gorm.DB, orgID, userID, programID uuid.UUID) (bool, error) {
	var count int64
	err := tx.Table("enrollments AS e").Joins("JOIN cohorts AS c ON c.id = e.cohort_id").Where("c.org_id = ? AND c.program_id = ? AND e.user_id = ? AND e.status <> ?", orgID, programID, userID, "withdrawn").Count(&count).Error
	return count > 0, err
}

func validatePaymentProgramPrice(program *paymentProgram) error {
	if !program.PaymentRequired {
		return ErrPaymentNotRequired
	}
	if program.PriceAmount <= 0 || !paymentCurrencyCode.MatchString(program.Currency) {
		return ErrInvalidProgramPrice
	}
	return nil
}

func newPaymentReceipt() string { return "po_" + uuid.NewString() }
