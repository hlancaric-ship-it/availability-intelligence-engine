-- 004: Tenant isolation + supplier external order IDs.
-- Pre-production migration: existing rows in procurement_ready_to_ship / idempotency keys have no tenant
-- and are cleared, because they cannot be attributed safely.

-- K6: store supplier-side order ID returned at dispatch, so status updates can be matched.
ALTER TABLE procurement_purchase_orders ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_po_external_id
  ON procurement_purchase_orders (tenant_id, supplier_id, external_id) WHERE external_id IS NOT NULL;

-- K7: ready-to-ship allocations are per tenant (previously the dashboard showed all tenants' rows).
DELETE FROM procurement_ready_to_ship;
ALTER TABLE procurement_ready_to_ship ADD COLUMN tenant_id TEXT NOT NULL;
ALTER TABLE procurement_ready_to_ship DROP CONSTRAINT IF EXISTS procurement_ready_to_ship_pkey;
ALTER TABLE procurement_ready_to_ship ADD PRIMARY KEY (tenant_id, customer_order_line_id);

-- K7: idempotency keys are now prefixed with "<tenantId>:" by the workflow; old un-prefixed keys are obsolete.
DELETE FROM procurement_idempotency_keys WHERE key NOT LIKE '%:%';

-- Helpful indexes for tenant-scoped queries.
CREATE INDEX IF NOT EXISTS idx_po_tenant_status ON procurement_purchase_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_po_lines_customer_line ON procurement_purchase_order_lines (customer_order_line_id);
