package payments

import (
	"time"

	"github.com/google/uuid"
)

const (
	OrderStatusCreated              = "created"
	OrderStatusProviderOrderCreated = "provider_order_created"
	OrderStatusAttempted            = "attempted"
	OrderStatusPaid                 = "paid"
	OrderStatusFailed               = "failed"
	OrderStatusCancelled            = "cancelled"
)

// PaymentOrder is the local source of truth for a program purchase. Amount is
// always copied from the program in minor currency units, never from a client.
type PaymentOrder struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID             uuid.UUID `gorm:"type:uuid;not null"`
	UserID            uuid.UUID `gorm:"type:uuid;not null"`
	ProgramID         uuid.UUID `gorm:"type:uuid;not null"`
	Provider          string    `gorm:"not null;default:razorpay"`
	ProviderOrderID   *string
	ProviderKeyID     *string
	ProviderPaymentID *string
	// PaypalOrderID / PaypalCaptureID are populated only when Provider ==
	// "paypal" - kept as dedicated columns rather than reusing
	// ProviderOrderID/ProviderPaymentID so each provider's ID shape stays
	// unambiguous at the schema level. Razorpay continues to use the
	// generic Provider*ID columns above, unchanged.
	PaypalOrderID      *string
	PaypalCaptureID    *string
	Amount             int64  `gorm:"not null"`
	Currency           string `gorm:"type:char(3);not null;default:INR"`
	CatalogAmount      int64  `gorm:"not null;default:0"`
	CatalogCurrency    string `gorm:"type:char(3);not null;default:INR"`
	ExchangeRate       *string
	Status             string `gorm:"type:payment_order_status;not null;default:created"`
	Receipt            string `gorm:"not null;uniqueIndex"`
	FailureCode        *string
	FailureDescription *string
	PaidAt             *time.Time
	EnrolledAt         *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

func (PaymentOrder) TableName() string { return "payment_orders" }

type PaymentEvent struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID             *uuid.UUID `gorm:"type:uuid"`
	Provider          string     `gorm:"not null;default:razorpay"`
	ProviderEventID   *string
	EventType         string `gorm:"not null"`
	ProviderOrderID   *string
	ProviderPaymentID *string
	RawPayload        []byte `gorm:"type:jsonb;not null"`
	Processed         bool   `gorm:"not null;default:false"`
	ProcessingStatus  string `gorm:"not null;default:pending"`
	ProcessingError   *string
	ReceivedAt        time.Time
	ProcessedAt       *time.Time
}

func (PaymentEvent) TableName() string { return "payment_events" }
