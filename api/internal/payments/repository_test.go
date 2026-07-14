package payments

import (
	"testing"

	"gorm.io/gorm"
)

func TestActiveOrderStatusesExcludeTerminalOrders(t *testing.T) {
	for _, status := range activeOrderStatuses {
		if status == OrderStatusPaid || status == OrderStatusFailed || status == OrderStatusCancelled {
			t.Fatalf("terminal status marked active: %s", status)
		}
	}
}

func TestPaymentModelTableNames(t *testing.T) {
	if (PaymentOrder{}).TableName() != "payment_orders" || (PaymentEvent{}).TableName() != "payment_events" {
		t.Fatal("unexpected payment table mapping")
	}
}

func TestRequirePaymentOrderUpdate(t *testing.T) {
	if err := requirePaymentOrderUpdate(&gorm.DB{}); err != ErrPaymentOrderNotFound {
		t.Fatalf("zero-row update error = %v", err)
	}
	if err := requirePaymentOrderUpdate(&gorm.DB{RowsAffected: 1}); err != nil {
		t.Fatalf("successful update error = %v", err)
	}
}
