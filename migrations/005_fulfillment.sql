-- 005: Warehouse / fulfillment (safety lock, scanner packing, shipping). All rows are tenant-scoped.

CREATE TABLE IF NOT EXISTS fulfillment_orders (
  tenant_id        TEXT NOT NULL,
  order_id         TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('WAITING_FOR_STOCK','AWAITING_PAYMENT','READY_TO_PACK','PACKING','PACKED','SHIPPED','CANCELLED')),
  payment_status   TEXT CHECK (payment_status IN ('PAID','UNPAID','COD','PARTIALLY_PAID')),
  payment_method   TEXT CHECK (payment_method IN ('CARD','BANK_TRANSFER','COD','PAYPAL')),
  carrier          TEXT,
  tracking_number  TEXT,
  shipped_at       TIMESTAMPTZ,
  version          INTEGER NOT NULL CHECK (version > 0),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, order_id)
);

CREATE TABLE IF NOT EXISTS fulfillment_order_lines (
  tenant_id              TEXT NOT NULL,
  order_id               TEXT NOT NULL,
  customer_order_line_id TEXT NOT NULL,
  product_id             TEXT NOT NULL,
  variant_id             TEXT NOT NULL,
  sku                    TEXT NOT NULL,
  ean                    TEXT,
  ordered_quantity       INTEGER NOT NULL CHECK (ordered_quantity > 0),
  allocated_quantity     INTEGER NOT NULL DEFAULT 0 CHECK (allocated_quantity >= 0 AND allocated_quantity <= ordered_quantity),
  packed_quantity        INTEGER NOT NULL DEFAULT 0 CHECK (packed_quantity >= 0 AND packed_quantity <= ordered_quantity),
  PRIMARY KEY (tenant_id, customer_order_line_id),
  FOREIGN KEY (tenant_id, order_id) REFERENCES fulfillment_orders (tenant_id, order_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_orders_status ON fulfillment_orders (tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_fulfillment_lines_order ON fulfillment_order_lines (tenant_id, order_id);
