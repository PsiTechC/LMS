package payments

import "github.com/xa-lms/api/pkg/database"

// InitSchema applies the payment tables to shared databases safely at startup.
func InitSchema() error {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return err
	}
	_, err = sqlDB.Exec(`
		DO $$ BEGIN
			CREATE TYPE payment_order_status AS ENUM ('created', 'provider_order_created', 'attempted', 'paid', 'failed', 'cancelled');
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;
		CREATE TABLE IF NOT EXISTS payment_orders (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), org_id UUID NOT NULL REFERENCES organizations(id), user_id UUID NOT NULL REFERENCES users(id), program_id UUID NOT NULL REFERENCES programs(id), provider TEXT NOT NULL DEFAULT 'razorpay', provider_order_id TEXT, provider_payment_id TEXT, amount BIGINT NOT NULL CHECK (amount >= 0), currency CHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'), status payment_order_status NOT NULL DEFAULT 'created', receipt TEXT NOT NULL UNIQUE, failure_code TEXT, failure_description TEXT, paid_at TIMESTAMPTZ, enrolled_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE TABLE IF NOT EXISTS payment_events (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), org_id UUID REFERENCES organizations(id), provider TEXT NOT NULL DEFAULT 'razorpay', provider_event_id TEXT, event_type TEXT NOT NULL, provider_order_id TEXT, provider_payment_id TEXT, raw_payload JSONB NOT NULL, processed BOOLEAN NOT NULL DEFAULT FALSE, processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'failed')), processing_error TEXT, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), processed_at TIMESTAMPTZ
		);
		ALTER TABLE payment_orders ALTER COLUMN provider_order_id DROP NOT NULL;
		CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_orders_provider_order_id ON payment_orders(provider_order_id) WHERE provider_order_id IS NOT NULL;
		CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_orders_provider_payment_id ON payment_orders(provider_payment_id) WHERE provider_payment_id IS NOT NULL;
		CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_events_provider_event_id ON payment_events(provider, provider_event_id) WHERE provider_event_id IS NOT NULL;
		CREATE INDEX IF NOT EXISTS idx_payment_orders_org_id ON payment_orders(org_id);
		CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id ON payment_orders(user_id);
		CREATE INDEX IF NOT EXISTS idx_payment_orders_program_id ON payment_orders(program_id);
		CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
		CREATE INDEX IF NOT EXISTS idx_payment_events_org_id ON payment_events(org_id);
		CREATE UNIQUE INDEX IF NOT EXISTS uq_cohorts_program_unassigned ON cohorts(org_id, program_id, name) WHERE name = 'Unassigned';
		CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollments_active_participant ON enrollments(cohort_id, user_id) WHERE role = 'participant' AND status <> 'withdrawn';
	`)
	return err
}
