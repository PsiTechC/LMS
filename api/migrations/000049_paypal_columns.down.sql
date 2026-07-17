DROP INDEX IF EXISTS uq_payment_orders_paypal_capture_id;
DROP INDEX IF EXISTS uq_payment_orders_paypal_order_id;
ALTER TABLE payment_orders DROP COLUMN IF EXISTS paypal_capture_id;
ALTER TABLE payment_orders DROP COLUMN IF EXISTS paypal_order_id;
