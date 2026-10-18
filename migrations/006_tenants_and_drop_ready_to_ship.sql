-- 006: Tenant registry for the scheduler (TODO krok 2) + drop the unused ready-to-ship table.
-- procurement_ready_to_ship was never written by any code path; the dashboard now reads fulfillment_orders (migration 005).
-- Pre-production migration (no live data yet, see PROGRESS_LOG).

CREATE TABLE IF NOT EXISTS tenants (
  tenant_id          TEXT PRIMARY KEY CHECK (tenant_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  platform           TEXT NOT NULL,                       -- adapter key, e.g. 'shoptet'
  integration_mode   TEXT NOT NULL CHECK (integration_mode IN ('api','import')),
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  -- Safe default: every purchase order waits for manual approval until the shop opts in to automatic mode.
  approval_mode      TEXT NOT NULL DEFAULT 'manual' CHECK (approval_mode IN ('automatic','manual')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
  platform_shop_id   TEXT,                                -- shop ID on the platform (e.g. Shoptet eshopId), for webhooks
  UNIQUE (platform, platform_shop_id)
);

-- Platform credentials (OAuth tokens, API keys, webhook secrets) – AES-256-GCM ciphertext only,
-- key lives in a Worker secret (EncryptedPostgresCredentialsStore). Deleted together with the tenant (uninstall / GDPR).
CREATE TABLE IF NOT EXISTS tenant_credentials (
  tenant_id   TEXT PRIMARY KEY REFERENCES tenants (tenant_id) ON DELETE CASCADE,
  iv          TEXT NOT NULL,
  ciphertext  TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenants_enabled ON tenants (enabled) WHERE enabled;

DROP TABLE IF EXISTS procurement_ready_to_ship;
