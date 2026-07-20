package payments

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var activeOrderStatuses = []string{OrderStatusCreated, OrderStatusProviderOrderCreated, OrderStatusAttempted}

func withinPaymentTransaction(fn func(tx *gorm.DB) error) error { return database.DB.Transaction(fn) }

func createPaymentOrder(tx *gorm.DB, order *PaymentOrder) error { return tx.Create(order).Error }

func getPaymentOrderByID(orgID, orderID uuid.UUID) (*PaymentOrder, error) {
	var order PaymentOrder
	err := database.DB.Where("id = ? AND org_id = ?", orderID, orgID).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPaymentOrderNotFound
	}
	return &order, err
}

func getPaymentOrderByProviderOrderID(orgID uuid.UUID, providerOrderID string) (*PaymentOrder, error) {
	var order PaymentOrder
	err := database.DB.Where("org_id = ? AND provider_order_id = ?", orgID, providerOrderID).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPaymentOrderNotFound
	}
	return &order, err
}

func getPaymentOrderForParticipant(providerOrderID string, userID uuid.UUID) (*PaymentOrder, error) {
	var order PaymentOrder
	err := database.DB.Where("provider_order_id = ? AND user_id = ?", providerOrderID, userID).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPaymentOrderNotFound
	}
	return &order, err
}

// getPaymentOrderByIDForParticipant loads by the internal payment_order_id,
// scoping by user_id instead of org_id - used by the capture/status
// endpoints, which only know the internal id and the caller's identity (no
// org_id available from JWT claims), mirroring getPaymentOrderForParticipant's
// ownership-via-WHERE-clause pattern above.
func getPaymentOrderByIDForParticipant(paymentOrderID, userID uuid.UUID) (*PaymentOrder, error) {
	var order PaymentOrder
	err := database.DB.Where("id = ? AND user_id = ?", paymentOrderID, userID).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPaymentOrderNotFound
	}
	return &order, err
}

func participantBelongsToOrganization(orgID, userID uuid.UUID) (bool, error) {
	var count int64
	err := database.DB.Table("org_members").Where("org_id = ? AND user_id = ?", orgID, userID).Count(&count).Error
	return count > 0, err
}
func getPaymentOrderByProviderOrderIDAny(providerOrderID string) (*PaymentOrder, error) {
	var order PaymentOrder
	err := database.DB.Where("provider_order_id = ?", providerOrderID).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPaymentOrderNotFound
	}
	return &order, err
}

// getPaymentOrderByPaypalOrderIDAny mirrors getPaymentOrderByProviderOrderIDAny
// but looks up by PayPal's own order-id column (see model.go) - used by the
// PayPal webhook handler the same way Razorpay's webhook uses the function
// above.
func getPaymentOrderByPaypalOrderIDAny(paypalOrderID string) (*PaymentOrder, error) {
	var order PaymentOrder
	err := database.DB.Where("paypal_order_id = ?", paypalOrderID).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPaymentOrderNotFound
	}
	return &order, err
}

func getPaymentOrderByProviderPaymentID(orgID uuid.UUID, providerPaymentID string) (*PaymentOrder, error) {
	var order PaymentOrder
	err := database.DB.Where("org_id = ? AND provider_payment_id = ?", orgID, providerPaymentID).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPaymentOrderNotFound
	}
	return &order, err
}

func getPaymentOrderForFinalization(tx *gorm.DB, orgID, orderID uuid.UUID) (*PaymentOrder, error) {
	var order PaymentOrder
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND org_id = ?", orderID, orgID).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPaymentOrderNotFound
	}
	return &order, err
}

func findActivePaymentOrder(tx *gorm.DB, orgID, userID, programID uuid.UUID) (*PaymentOrder, error) {
	var order PaymentOrder
	err := tx.Where("org_id = ? AND user_id = ? AND program_id = ? AND status IN ?", orgID, userID, programID, activeOrderStatuses).Order("created_at DESC").First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &order, err
}

func updateProviderOrderID(tx *gorm.DB, orgID, orderID uuid.UUID, providerOrderID, providerKeyID string) error {
	return requirePaymentOrderUpdate(tx.Model(&PaymentOrder{}).Where("id = ? AND org_id = ?", orderID, orgID).Updates(map[string]any{"provider_order_id": providerOrderID, "provider_key_id": providerKeyID, "status": OrderStatusProviderOrderCreated}))
}

// updatePaypalOrderID stores a newly-created PayPal order id on the local
// order row. Distinct from updateProviderOrderID (Razorpay) since PayPal has
// no equivalent "key rotation" reuse concept - it only needs the order id
// and status.
func updatePaypalSettlement(tx *gorm.DB, orgID, orderID uuid.UUID, amount int64, currency string, catalogAmount int64, catalogCurrency, rate string) error {
	return requirePaymentOrderUpdate(tx.Model(&PaymentOrder{}).Where("id = ? AND org_id = ?", orderID, orgID).Updates(map[string]any{"amount": amount, "currency": currency, "catalog_amount": catalogAmount, "catalog_currency": catalogCurrency, "exchange_rate": rate}))
}
func updatePaypalOrderID(tx *gorm.DB, orgID, orderID uuid.UUID, paypalOrderID string) error {
	return requirePaymentOrderUpdate(tx.Model(&PaymentOrder{}).Where("id = ? AND org_id = ?", orderID, orgID).Updates(map[string]any{"paypal_order_id": paypalOrderID, "status": OrderStatusProviderOrderCreated}))
}

func updatePaymentStatus(tx *gorm.DB, orgID, orderID uuid.UUID, status string) error {
	return requirePaymentOrderUpdate(tx.Model(&PaymentOrder{}).Where("id = ? AND org_id = ?", orderID, orgID).Update("status", status))
}

func recordPaymentFailure(tx *gorm.DB, orgID, orderID uuid.UUID, code, description string) error {
	return requirePaymentOrderUpdate(tx.Model(&PaymentOrder{}).Where("id = ? AND org_id = ?", orderID, orgID).Updates(map[string]any{"status": OrderStatusFailed, "failure_code": code, "failure_description": description}))
}

func markPaymentPaid(tx *gorm.DB, orgID, orderID uuid.UUID, providerPaymentID string, paidAt time.Time) error {
	return requirePaymentOrderUpdate(tx.Model(&PaymentOrder{}).Where("id = ? AND org_id = ?", orderID, orgID).Updates(map[string]any{"status": OrderStatusPaid, "provider_payment_id": providerPaymentID, "paid_at": paidAt}))
}

func markPaymentEnrollmentCompleted(tx *gorm.DB, orgID, orderID uuid.UUID, enrolledAt time.Time) error {
	return requirePaymentOrderUpdate(tx.Model(&PaymentOrder{}).Where("id = ? AND org_id = ?", orderID, orgID).Update("enrolled_at", enrolledAt))
}

func requirePaymentOrderUpdate(result *gorm.DB) error {
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrPaymentOrderNotFound
	}
	return nil
}

func createPaymentEvent(tx *gorm.DB, event *PaymentEvent) error { return tx.Create(event).Error }

func getPaymentEventByProviderEventID(tx *gorm.DB, orgID uuid.UUID, provider, providerEventID string) (*PaymentEvent, error) {
	var event PaymentEvent
	err := tx.Where("org_id = ? AND provider = ? AND provider_event_id = ?", orgID, provider, providerEventID).First(&event).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &event, err
}

func paymentEventAlreadyRecorded(tx *gorm.DB, orgID uuid.UUID, provider, providerEventID string) (bool, error) {
	event, err := getPaymentEventByProviderEventID(tx, orgID, provider, providerEventID)
	return event != nil, err
}
