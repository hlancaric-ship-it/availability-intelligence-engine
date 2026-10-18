-- 003: Align purchase-order status constraint with statuses the code actually writes.
-- Without this, cancel(), updateStatus('ACCEPTED'|'SHIPPED'|'CANCELLED') fail with a CHECK violation in production.
ALTER TABLE procurement_purchase_orders DROP CONSTRAINT IF EXISTS procurement_purchase_orders_status_check;
ALTER TABLE procurement_purchase_orders ADD CONSTRAINT procurement_purchase_orders_status_check
  CHECK (status IN ('DRAFT','PENDING_APPROVAL','SENT','ACCEPTED','SHIPPED','PARTIALLY_RECEIVED','RECEIVED','COMPLETED','CANCELLED'));

-- Idempotency keys in FAILED state may be re-claimed (see PostgresProcurementRepository.claim).
CREATE INDEX IF NOT EXISTS idx_idempotency_failed ON procurement_idempotency_keys (state) WHERE state = 'FAILED';
