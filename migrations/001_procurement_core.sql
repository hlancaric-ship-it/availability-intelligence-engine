-- Portable PostgreSQL baseline. Tenant-specific platform settings remain adapter configuration.
CREATE TABLE procurement_supplier_offers (
  tenant_id TEXT NOT NULL, supplier_id TEXT NOT NULL, supplier_sku TEXT NOT NULL,
  product_id TEXT NOT NULL, variant_id TEXT NOT NULL, available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0),
  unit_price NUMERIC(14,4) NOT NULL CHECK (unit_price >= 0), currency CHAR(3) NOT NULL,
  lead_time_days INTEGER NOT NULL CHECK (lead_time_days >= 0), active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (tenant_id, supplier_id, supplier_sku, variant_id)
);
CREATE TABLE procurement_purchase_orders (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, supplier_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','PENDING_APPROVAL','SENT','PARTIALLY_RECEIVED','RECEIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE procurement_purchase_order_lines (
  id TEXT PRIMARY KEY, purchase_order_id TEXT NOT NULL REFERENCES procurement_purchase_orders(id),
  customer_order_line_id TEXT NOT NULL, product_id TEXT NOT NULL, variant_id TEXT NOT NULL,
  supplier_sku TEXT NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0),
  received_quantity INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_price NUMERIC(14,4) NOT NULL, currency CHAR(3) NOT NULL
);
CREATE TABLE procurement_idempotency_keys (
  key TEXT NOT NULL, operation TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PROCESSING','COMPLETED','FAILED')),
  completed_at TIMESTAMPTZ, PRIMARY KEY (key, operation)
);
CREATE TABLE procurement_audit_log (
  id BIGSERIAL PRIMARY KEY, tenant_id TEXT NOT NULL, event_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, payload JSONB NOT NULL, occurred_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE procurement_ready_to_ship (
  customer_order_line_id TEXT PRIMARY KEY, allocated_quantity INTEGER NOT NULL CHECK (allocated_quantity > 0),
  ready_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
