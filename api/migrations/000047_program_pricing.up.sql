ALTER TABLE programs
    ADD COLUMN IF NOT EXISTS payment_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS price_amount BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'INR',
    ADD COLUMN IF NOT EXISTS gst_inclusive BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS gst_rate_bps INT NOT NULL DEFAULT 0;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_programs_price_amount_nonnegative') THEN ALTER TABLE programs ADD CONSTRAINT chk_programs_price_amount_nonnegative CHECK (price_amount >= 0); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_programs_gst_rate_bps_nonnegative') THEN ALTER TABLE programs ADD CONSTRAINT chk_programs_gst_rate_bps_nonnegative CHECK (gst_rate_bps >= 0); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_programs_currency_code') THEN ALTER TABLE programs ADD CONSTRAINT chk_programs_currency_code CHECK (currency ~ '^[A-Z]{3}$'); END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_programs_paid_price') THEN ALTER TABLE programs ADD CONSTRAINT chk_programs_paid_price CHECK (NOT payment_required OR price_amount > 0); END IF;
END $$;