package payments

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrPaymentOrderOwnership    = errors.New("payment order does not belong to participant")
	ErrPaymentOrderConflict     = errors.New("payment order has a conflicting payment")
	ErrProviderAmountMismatch   = errors.New("provider amount does not match local order")
	ErrProviderCurrencyMismatch = errors.New("provider currency does not match local order")
)

type FinalizePaidOrderInput struct {
	OrganizationID    uuid.UUID
	ParticipantID     uuid.UUID
	PaymentOrderID    uuid.UUID
	ProviderOrderID   string
	ProviderPaymentID string
	ProviderAmount    int64
	ProviderCurrency  string
	PaidAt            time.Time
}

type FinalizePaidOrderResult struct {
	PaymentOrderID uuid.UUID `json:"payment_order_id"`
	ProgramID      uuid.UUID `json:"program_id"`
	EnrollmentID   uuid.UUID `json:"enrollment_id"`
	Status         string    `json:"status"`
}

// FinalizePaidOrder atomically marks the local order paid and enrolls the participant.
// All provider calls must complete before invoking this method.
func FinalizePaidOrder(ctx context.Context, input FinalizePaidOrderInput) (*FinalizePaidOrderResult, error) {
	var result FinalizePaidOrderResult
	err := database.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var order PaymentOrder
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND org_id = ?", input.PaymentOrderID, input.OrganizationID).First(&order).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrPaymentOrderNotFound
		}
		if err != nil {
			return err
		}
		if order.UserID != input.ParticipantID {
			return ErrPaymentOrderOwnership
		}
		if storedOrderID := order.providerOrderIDValue(); storedOrderID == nil || *storedOrderID != input.ProviderOrderID {
			return ErrProviderOrderMismatch
		}
		if storedPaymentID := order.providerPaymentIDValue(); storedPaymentID != nil && *storedPaymentID != "" && *storedPaymentID != input.ProviderPaymentID {
			return ErrPaymentOrderConflict
		}
		if order.Amount != input.ProviderAmount {
			return ErrProviderAmountMismatch
		}
		if order.Currency != input.ProviderCurrency {
			return ErrProviderCurrencyMismatch
		}
		cohortID, err := ensurePaymentCohort(tx, order.OrgID, order.ProgramID)
		if err != nil {
			return err
		}
		enrollmentID, err := ensurePaymentEnrollment(tx, cohortID, order.UserID)
		if err != nil {
			return err
		}
		if err := tx.Exec("INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?) ON CONFLICT (org_id, user_id) DO NOTHING", order.OrgID, order.UserID, "participant").Error; err != nil {
			return err
		}
		paidAt := input.PaidAt
		if paidAt.IsZero() {
			paidAt = time.Now().UTC()
		}
		if order.Status != OrderStatusPaid {
			if err := tx.Model(&PaymentOrder{}).Where("id = ? AND org_id = ?", order.ID, order.OrgID).Updates(map[string]any{"status": OrderStatusPaid, order.providerPaymentIDColumn(): input.ProviderPaymentID, "paid_at": paidAt}).Error; err != nil {
				return err
			}
		}
		if err := tx.Model(&PaymentOrder{}).Where("id = ? AND org_id = ?", order.ID, order.OrgID).Updates(map[string]any{"enrolled_at": gorm.Expr("COALESCE(enrolled_at, ?)", paidAt)}).Error; err != nil {
			return err
		}
		result = FinalizePaidOrderResult{PaymentOrderID: order.ID, ProgramID: order.ProgramID, EnrollmentID: enrollmentID, Status: OrderStatusPaid}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

// providerOrderIDValue/providerPaymentIDValue/providerPaymentIDColumn
// generalize FinalizePaidOrder to work for either provider, per Phase 3's
// column choice: Razorpay keeps using the original generic
// provider_order_id/provider_payment_id columns; PayPal uses its own
// dedicated paypal_order_id/paypal_capture_id columns (see model.go). For
// order.Provider == "razorpay" these all resolve to exactly the same
// field/column FinalizePaidOrder always used — Razorpay's behavior is
// unchanged.
func (o *PaymentOrder) providerOrderIDValue() *string {
	if o.Provider == "paypal" {
		return o.PaypalOrderID
	}
	return o.ProviderOrderID
}

func (o *PaymentOrder) providerPaymentIDValue() *string {
	if o.Provider == "paypal" {
		return o.PaypalCaptureID
	}
	return o.ProviderPaymentID
}

func (o *PaymentOrder) providerPaymentIDColumn() string {
	if o.Provider == "paypal" {
		return "paypal_capture_id"
	}
	return "provider_payment_id"
}

func scanUUID(tx *gorm.DB, sql string, args ...any) (uuid.UUID, error) {
	var raw string
	if err := tx.Raw(sql, args...).Scan(&raw).Error; err != nil {
		return uuid.Nil, err
	}
	if raw == "" {
		return uuid.Nil, nil
	}
	return uuid.Parse(raw)
}

func ensurePaymentCohort(tx *gorm.DB, orgID, programID uuid.UUID) (uuid.UUID, error) {
	const query = `SELECT id::text FROM cohorts WHERE org_id = ? AND program_id = ? AND name = 'Unassigned' ORDER BY created_at LIMIT 1 FOR UPDATE`
	id, err := scanUUID(tx, query, orgID, programID)
	if err != nil {
		return uuid.Nil, err
	}
	if id != uuid.Nil {
		return id, nil
	}
	candidate := uuid.New()
	if err := tx.Exec(`INSERT INTO cohorts (id, org_id, program_id, name, max_seats, is_active) VALUES (?, ?, ?, 'Unassigned', 0, true) ON CONFLICT DO NOTHING`, candidate, orgID, programID).Error; err != nil {
		return uuid.Nil, err
	}
	return scanUUID(tx, query, orgID, programID)
}

func ensurePaymentEnrollment(tx *gorm.DB, cohortID, userID uuid.UUID) (uuid.UUID, error) {
	const query = `SELECT id::text FROM enrollments WHERE cohort_id = ? AND user_id = ? AND role = 'participant' AND status <> 'withdrawn' ORDER BY enrolled_at LIMIT 1 FOR UPDATE`
	id, err := scanUUID(tx, query, cohortID, userID)
	if err != nil {
		return uuid.Nil, err
	}
	if id != uuid.Nil {
		return id, nil
	}
	candidate := uuid.New()
	if err := tx.Exec(`INSERT INTO enrollments (id, cohort_id, user_id, role, status, enrolled_at) VALUES (?, ?, ?, 'participant', 'enrolled', NOW()) ON CONFLICT DO NOTHING`, candidate, cohortID, userID).Error; err != nil {
		return uuid.Nil, err
	}
	return scanUUID(tx, query, cohortID, userID)
}
