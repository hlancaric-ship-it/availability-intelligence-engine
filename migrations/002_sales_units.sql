-- Sales Units domain: prodejní jednotky a zálohy za obaly
-- Migration 002 — navazuje na 001_procurement_core.sql

CREATE TABLE sales_units (
  id           TEXT NOT NULL,
  tenant_id    TEXT NOT NULL,
  product_id   TEXT NOT NULL,
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  base_quantity                INTEGER       NOT NULL CHECK (base_quantity > 0),
  base_unit                    TEXT          NOT NULL,
  weight_per_base_unit_grams   INTEGER       NOT NULL DEFAULT 0 CHECK (weight_per_base_unit_grams >= 0),
  price_multiplier             NUMERIC(10,6) NOT NULL DEFAULT 1 CHECK (price_multiplier >= 0),
  minimum_quantity             INTEGER       NOT NULL DEFAULT 1 CHECK (minimum_quantity > 0),
  order_step                   INTEGER       NOT NULL DEFAULT 1 CHECK (order_step > 0),
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, product_id, code)
);
CREATE INDEX idx_sales_units_tenant_product ON sales_units (tenant_id, product_id);
CREATE INDEX idx_sales_units_active         ON sales_units (tenant_id, active);

CREATE TABLE packaging_deposit_rules (
  id                    TEXT          NOT NULL,
  tenant_id             TEXT          NOT NULL,
  sales_unit_id         TEXT          NOT NULL REFERENCES sales_units(id) ON DELETE CASCADE,
  packaging_type        TEXT          NOT NULL,
  deposit_amount        NUMERIC(14,4) NOT NULL CHECK (deposit_amount >= 0),
  currency              CHAR(3)       NOT NULL,
  quantity_per_sales_unit INTEGER     NOT NULL DEFAULT 1 CHECK (quantity_per_sales_unit > 0),
  refundable            BOOLEAN       NOT NULL DEFAULT TRUE,
  active                BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, sales_unit_id, packaging_type)
);
CREATE INDEX idx_deposit_rules_sales_unit ON packaging_deposit_rules (sales_unit_id);
