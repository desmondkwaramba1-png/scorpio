-- Earlier purchase completion set fulfillment_status and delivered tokens
-- but forgot payment_status='paid'. A non-null fulfillment state is only
-- assigned after the gateway confirms payment (or a free order settles),
-- so these pending rows are completed orders, not unfinished checkouts.
UPDATE purchases
SET payment_status = 'paid'
WHERE payment_status = 'pending'
  AND fulfillment_status IS NOT NULL;