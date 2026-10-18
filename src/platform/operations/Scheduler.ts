import type { LoggerPort } from '../../core/procurement/ports.js';
import type { ProcurementWorkflow } from '../../core/procurement/Workflow.js';
import type { ProcurementPolicy } from '../../core/procurement/types.js';
import type { IntegrationMode, TenantConfig } from '../../tenants/configuration.js';
import type { TenantLookupPort } from '../../core/platform/PlatformAdapter.js';
import type { TransactionalSql } from '../persistence/PostgresProcurementRepository.js';

export interface ScheduledTenant extends TenantConfig { approvalMode: ProcurementPolicy['approvalMode'] }

export interface TenantRegistryPort {
    listEnabledTenants(): Promise<ScheduledTenant[]>;
}

/** Wired per tenant by the deployment layer. undefined = platform adapter not available yet (skip, no error). */
export type PipelineFactory = (tenant: ScheduledTenant) => Promise<ProcurementWorkflow | undefined>;

export interface SchedulerRunSummary { job: 'PLAN' | 'SUPPLIER_STATUS'; eventId: string; ok: string[]; skipped: string[]; failed: string[] }

/**
 * Automatic runs (TODO krok 2): fetch orders → plan purchasing → dispatch → supplier statuses.
 *
 * - eventId is derived from the cron slot (minute), so a retried / duplicated cron invocation is a no-op
 *   thanks to the workflow's idempotency keys.
 * - Tenants are isolated: one failing shop never stops the others.
 * - Bounded concurrency keeps the Shoptet API rate limit and the Worker CPU budget in check.
 */
export class ProcurementScheduler {
    public constructor(
        private readonly registry: TenantRegistryPort,
        private readonly pipelineFor: PipelineFactory,
        private readonly logger: LoggerPort,
        private readonly concurrency = 4,
    ) {}

    public runPlanning(scheduledTime: Date): Promise<SchedulerRunSummary> {
        const eventId = `cron:plan:${slot(scheduledTime)}`;
        return this.forEachTenant('PLAN', eventId, (wf, t) => wf.createPlan(t.tenantId, eventId, { approvalMode: t.approvalMode }));
    }

    public runSupplierStatusSync(scheduledTime: Date): Promise<SchedulerRunSummary> {
        const eventId = `cron:status:${slot(scheduledTime)}`;
        return this.forEachTenant('SUPPLIER_STATUS', eventId, (wf, t) => wf.syncSupplierStatus(t.tenantId, eventId));
    }

    private async forEachTenant(job: SchedulerRunSummary['job'], eventId: string, run: (wf: ProcurementWorkflow, t: ScheduledTenant) => Promise<unknown>): Promise<SchedulerRunSummary> {
        const summary: SchedulerRunSummary = { job, eventId, ok: [], skipped: [], failed: [] };
        const tenants = await this.registry.listEnabledTenants();
        let next = 0;
        const worker = async () => {
            while (next < tenants.length) {
                const tenant = tenants[next++]!;
                try {
                    const workflow = await this.pipelineFor(tenant);
                    if (!workflow) {
                        summary.skipped.push(tenant.tenantId);
                        this.logger.warn('Scheduler: no platform adapter for tenant, skipped', { tenantId: tenant.tenantId, platform: tenant.platform, job });
                        continue;
                    }
                    await run(workflow, tenant);
                    summary.ok.push(tenant.tenantId);
                } catch (error) {
                    summary.failed.push(tenant.tenantId);
                    this.logger.error('Scheduler: tenant run failed', { tenantId: tenant.tenantId, job, eventId, error: error instanceof Error ? error.message : 'Unknown error' });
                }
            }
        };
        await Promise.all(Array.from({ length: Math.max(1, Math.min(this.concurrency, tenants.length)) }, worker));
        this.logger.info('Scheduler run finished', { job, eventId, ok: summary.ok.length, skipped: summary.skipped.length, failed: summary.failed.length });
        return summary;
    }
}

function slot(d: Date): string {
    return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
}

/** Reads the `tenants` table (migration 006). */
export class PostgresTenantRegistry implements TenantRegistryPort, TenantLookupPort {
    public constructor(private readonly db: TransactionalSql) {}

    public async getTenant(tenantId: string) {
        const res = await this.db.transaction((tx) => tx.query<{ tenant_id: string; platform: string; integration_mode: IntegrationMode; enabled: boolean; approval_mode: ProcurementPolicy['approvalMode'] }>(
            'SELECT tenant_id, platform, integration_mode, enabled, approval_mode FROM tenants WHERE tenant_id = $1', [tenantId]));
        const r = res.rows?.[0];
        return r ? { tenantId: r.tenant_id, platform: r.platform, integrationMode: r.integration_mode, enabled: r.enabled, approvalMode: r.approval_mode } : undefined;
    }

    /** Webhooks: platform shop ID → tenant. */
    public async findByPlatformShop(platform: string, platformShopId: string): Promise<string | undefined> {
        const res = await this.db.transaction((tx) => tx.query<{ tenant_id: string }>(
            'SELECT tenant_id FROM tenants WHERE platform = $1 AND platform_shop_id = $2 AND enabled', [platform, platformShopId]));
        return res.rows?.[0]?.tenant_id;
    }

    public async listEnabledTenants(): Promise<ScheduledTenant[]> {
        const res = await this.db.transaction((tx) => tx.query<{ tenant_id: string; platform: string; integration_mode: IntegrationMode; approval_mode: ProcurementPolicy['approvalMode'] }>(
            'SELECT tenant_id, platform, integration_mode, approval_mode FROM tenants WHERE enabled ORDER BY tenant_id',
        ));
        return (res.rows ?? []).map((r) => ({ tenantId: r.tenant_id, platform: r.platform, integrationMode: r.integration_mode, enabled: true, approvalMode: r.approval_mode }));
    }
}
