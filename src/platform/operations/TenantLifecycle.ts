import type { InstallResult, PlatformCredentialsPort } from '../../core/platform/PlatformAdapter.js';
import type { AuditPort, LoggerPort } from '../../core/procurement/ports.js';
import type { TransactionalSql } from '../persistence/PostgresProcurementRepository.js';

/** Deterministic tenant ID from platform + shop ID (no client-chosen IDs). */
export function tenantIdFor(platform: string, platformShopId: string): string {
    const shop = platformShopId.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 96);
    if (!shop) throw new Error('Empty platform shop ID');
    return `${platform}-${shop}`;
}

/**
 * Platform-neutral install / uninstall. Every adapter only produces an InstallResult or an APP_UNINSTALLED
 * event; persistence and GDPR erasure live here, once, for all platforms.
 */
export class TenantLifecycleService {
    public constructor(
        private readonly db: TransactionalSql,
        private readonly credentials: PlatformCredentialsPort,
        private readonly audit: AuditPort,
        private readonly logger: LoggerPort,
    ) {}

    public async install(platform: string, result: InstallResult): Promise<string> {
        const tenantId = tenantIdFor(platform, result.platformShopId);
        await this.db.transaction((tx) => tx.query(
            `INSERT INTO tenants (tenant_id, platform, integration_mode, enabled, platform_shop_id)
             VALUES ($1, $2, 'api', TRUE, $3)
             ON CONFLICT (tenant_id) DO UPDATE SET enabled = TRUE, updated_at = NOW()`,
            [tenantId, platform, result.platformShopId]));
        await this.credentials.put(tenantId, result.credentials);
        await this.audit.append({ tenantId, type: 'TENANT_INSTALLED', entityId: tenantId, payload: { platform }, occurredAt: new Date().toISOString() });
        this.logger.info('Tenant installed', { tenantId, platform });
        return tenantId;
    }

    /**
     * Uninstall = erase ALL data of the shop (GDPR art. 17, marketplace requirement), credentials included.
     * Single transaction: either everything is gone or nothing is. Only a minimal, non-personal log line remains.
     */
    public async uninstall(tenantId: string): Promise<void> {
        await this.db.transaction(async (tx) => {
            await tx.query(`DELETE FROM procurement_purchase_order_lines l USING procurement_purchase_orders po
                            WHERE l.purchase_order_id = po.id AND po.tenant_id = $1`, [tenantId]);
            for (const table of TENANT_TABLES) await tx.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
            // Idempotency keys are prefixed "<tenantId>:" by the workflow.
            await tx.query(`DELETE FROM procurement_idempotency_keys WHERE key LIKE $1`, [`${escapeLike(tenantId)}:%`]);
            await tx.query('DELETE FROM tenant_credentials WHERE tenant_id = $1', [tenantId]);
            await tx.query('DELETE FROM tenants WHERE tenant_id = $1', [tenantId]);
        });
        this.logger.info('Tenant uninstalled and data erased', { tenantId });
    }
}

/** Every table with a tenant_id column (children before parents). Keep in sync with migrations. */
export const TENANT_TABLES = [
    'fulfillment_order_lines',
    'fulfillment_orders',
    'procurement_purchase_orders',
    'procurement_supplier_offers',
    'procurement_audit_log',
    'packaging_deposit_rules',
    'sales_units',
] as const;

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
