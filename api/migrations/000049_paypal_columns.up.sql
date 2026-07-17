-- PayPal support: dedicated columns on payment_orders, populated only when
-- provider='paypal'. Razorpay keeps using the existing generic
-- provider_order_id / provider_payment_id columns, unchanged.
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS paypal_order_id TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS paypal_capture_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_orders_paypal_order_id ON payment_orders(paypal_order_id) WHERE paypal_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_orders_paypal_capture_id ON payment_orders(paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;
