-- The EcoCash number an order was paid from. Refunds are sent by hand, so the
-- admin needs the number the money actually came from, which can differ from
-- the phone on the account.
ALTER TABLE purchases ADD COLUMN payer_phone TEXT;
