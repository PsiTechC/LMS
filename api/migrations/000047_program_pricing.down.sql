ALTER TABLE programs
    DROP CONSTRAINT IF EXISTS chk_programs_paid_price,
    DROP CONSTRAINT IF EXISTS chk_programs_currency_code,
    DROP CONSTRAINT IF EXISTS chk_programs_gst_rate_bps_nonnegative,
    DROP CONSTRAINT IF EXISTS chk_programs_price_amount_nonnegative,
    DROP COLUMN IF EXISTS gst_rate_bps,
    DROP COLUMN IF EXISTS gst_inclusive,
    DROP COLUMN IF EXISTS currency,
    DROP COLUMN IF EXISTS price_amount,
    DROP COLUMN IF EXISTS payment_required;
