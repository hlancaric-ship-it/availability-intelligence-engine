import { Client } from 'pg';
import { FulfillmentService } from '../../core/fulfillment/FulfillmentService.js';
import { PlatformRoutedPaymentStatus } from '../../core/platform/PlatformAdapter.js';
import type { PlatformCredentialsPort, PlatformEvent, PlatformRegistry } from '../../core/platform/PlatformAdapter.js';
import { ProcurementWorkflow } from '../../core/procurement/Workflow.js';
import type { CommercePlatformPort, LoggerPort } from '../../core/procurement/ports.js';
import { AdminApi, bearerTokenAuthenticator } from '../http/AdminApi.js';
import { PostgresDashboardReader } from '../operations/DashboardEndpoint.js';
import { ProcurementScheduler, PostgresTenantRegistry } from '../operations/Scheduler.js';
import type { ScheduledTenant } from '../operations/Scheduler.js';
import { TenantLifecycleService } from '../operations/TenantLifecycle.js';
import { EncryptedPostgresCredentialsStore } from '../persistence/EncryptedPostgresCredentialsStore.js';
import { PgTransactionalSql } from '../persistence/PgTransactionalSql.js';
import { PostgresFulfillmentRepository } from '../persistence/PostgresFulfillmentRepository.js';
import { PostgresProcurementRepository } from '../persistence/PostgresProcurementRepository.js';
import type { TransactionalSql } from '../persistence/PostgresProcurementRepository.js';
import { createPlatformRegistry } from '../platforms.js';
import { SupplierIntegrationRegistry } from '../suppliers/SupplierIntegrationRegistry.js';

/** Bindings & secrets (wrangler.jsonc + `wrangler secret put`). */
export interface BackendEnv {
    /** Cloudflare Hyperdrive in front of PostgreSQL (migrations 001–007). */
    HYPERDRIVE?: { connectionString: string };
    /** 32 random bytes, base64 – encrypts platform credentials (OAuth tokens …). */
    CREDENTIALS_ENCRYPTION_KEY?: string;
    /** PROZATÍMNÍ přihlášení (do S1): náhodný token ≥ 32 znaků → jeden e-shop. */
    ADMIN_API_TOKEN?: string;
    ADMIN_TENANT_ID?: string;
    /** Shoptet add-on – see wrangler.jsonc "vars" and src/platform/shoptet/ShoptetConfig.ts. */
    SHOPTET_CLIENT_ID?: string;
    SHOPTET_CLIENT_SECRET?: string;
    SHOPTET_OAUTH_TOKEN_URL?: string;
    SHOPTET_ACCESS_TOKEN_URL?: string;
    SHOPTET_REDIRECT_URI?: string;
    SHOPTET_WEBHOOK_URL?: string;
    SHOPTET_OPEN_STATUS_IDS?: string;
}

export interface WaitUntil { waitUntil(promise: Promise<unknown>): void }

/** Structured JSON logs → Workers Logs / Logpush. Never pass tokens or payment amounts in context. */
export const workerLogger: LoggerPort = {
    info: (message, context) => console.log(JSON.stringify({ level: 'info', message, ...context })),
    warn: (message, context) => console.warn(JSON.stringify({ level: 'warn', message, ...context })),
    error: (message, context) => console.error(JSON.stringify({ level: 'error', message, ...context })),
};

/** Used for admin actions that never read platform orders (approve, cancel, scan, ship …). */
const platformNotUsed: CommercePlatformPort = {
    fetchUnfulfilledOrderLines: async () => { throw new Error('Commerce platform is not available in this context'); },
};

/** When no encryption key is configured, every credentials operation fails closed. */
const credentialsUnavailable: PlatformCredentialsPort = {
    get: async () => { throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured'); },
    put: async () => { throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured'); },
    delete: async () => { throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured'); },
};

export function buildServices(db: TransactionalSql, env: BackendEnv, platforms: PlatformRegistry, logger: LoggerPort = workerLogger) {
    const procurementRepo = new PostgresProcurementRepository(db);
    const fulfillmentRepository = new PostgresFulfillmentRepository(db);
    const dashboard = new PostgresDashboardReader(db);
    const tenants = new PostgresTenantRegistry(db);
    const credentials = env.CREDENTIALS_ENCRYPTION_KEY ? new EncryptedPostgresCredentialsStore(db, env.CREDENTIALS_ENCRYPTION_KEY) : credentialsUnavailable;
    // Fresh payment state always comes from the tenant's own platform adapter; unknown ⇒ order stays locked.
    const payments = new PlatformRoutedPaymentStatus(platforms, tenants, credentials);
    const fulfillment = new FulfillmentService(fulfillmentRepository, payments, procurementRepo, logger);
    // Supplier integrations are registered per tenant once suppliers are known (TODO krok 6); empty = dispatch refused.
    const suppliers = new SupplierIntegrationRegistry();
    const workflowWith = (platform: CommercePlatformPort) =>
        new ProcurementWorkflow(platform, suppliers, procurementRepo, suppliers, fulfillment, procurementRepo, procurementRepo, logger);

    /** Per-tenant pipeline for scheduled / webhook-triggered planning. undefined = no adapter for the platform. */
    const pipelineFor = async (tenant: Pick<ScheduledTenant, 'tenantId' | 'platform' | 'integrationMode'>) => {
        const adapter = platforms.get(tenant.platform);
        if (!adapter || !adapter.supportedModes.includes(tenant.integrationMode)) return undefined;
        return workflowWith(adapter.commerce({ tenantId: tenant.tenantId, integrationMode: tenant.integrationMode, credentials }));
    };

    const lifecycle = new TenantLifecycleService(db, credentials, procurementRepo, logger);
    return { procurementRepo, fulfillmentRepository, dashboard, tenants, credentials, fulfillment, workflow: workflowWith(platformNotUsed), pipelineFor, lifecycle };
}

/** Opens one Hyperdrive-backed connection for the lifetime of the work and closes it afterwards. */
export async function withDatabase<T>(env: BackendEnv, ctx: WaitUntil, work: (db: TransactionalSql) => Promise<T>): Promise<T> {
    if (!env.HYPERDRIVE?.connectionString) throw new Error('HYPERDRIVE binding is not configured');
    const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });
    await client.connect();
    try {
        return await work(new PgTransactionalSql(client));
    } finally {
        ctx.waitUntil(client.end().catch(() => undefined));
    }
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const jsonError = (status: number, code: string, message: string) =>
    new Response(JSON.stringify({ error: { code, message } }), { status, headers: JSON_HEADERS });

/**
 * Backend entry point for the Worker. Returns undefined for paths it does not own (static assets).
 *   /api/v1/*                              admin API (AdminApi)
 *   /platforms/<platform>/install          install callback of any registered platform
 *   /platforms/<platform>/webhook          webhooks of any registered platform
 */
export async function handleBackendRequest(request: Request, env: BackendEnv, ctx: WaitUntil): Promise<Response | undefined> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) return handleAdminApi(request, env, ctx);
    const platformRoute = /^\/platforms\/([a-z0-9-]{2,32})\/(install|webhook)$/.exec(pathname);
    if (platformRoute) return handlePlatformRoute(platformRoute[1]!, platformRoute[2] as 'install' | 'webhook', request, env, ctx);
    return undefined;
}

async function handleAdminApi(request: Request, env: BackendEnv, ctx: WaitUntil): Promise<Response> {
    // Authenticate before touching the database (cheap rejection of anonymous traffic).
    const authenticate = bearerTokenAuthenticator(env.ADMIN_API_TOKEN, env.ADMIN_TENANT_ID);
    if (!(await authenticate(request.clone()))) return jsonError(401, 'UNAUTHORIZED', 'Nepřihlášeno');
    try {
        return await withDatabase(env, ctx, async (db) => {
            const s = buildServices(db, env, createPlatformRegistry(env as Record<string, unknown>, workerLogger));
            const api = new AdminApi({ authenticate, dashboard: s.dashboard, audit: s.dashboard, fulfillment: s.fulfillment, fulfillmentRepository: s.fulfillmentRepository, workflow: s.workflow, logger: workerLogger });
            return (await api.handle(request)) ?? jsonError(404, 'NOT_FOUND', 'Neznámý endpoint');
        });
    } catch (error) {
        workerLogger.error('API bootstrap failed', { error: error instanceof Error ? error.message : 'Unknown error' });
        return jsonError(503, 'UNAVAILABLE', 'Služba je dočasně nedostupná');
    }
}

async function handlePlatformRoute(platform: string, action: 'install' | 'webhook', request: Request, env: BackendEnv, ctx: WaitUntil): Promise<Response> {
    const platforms = createPlatformRegistry(env as Record<string, unknown>, workerLogger);
    const adapter = platforms.get(platform);
    if (!adapter) return jsonError(404, 'UNKNOWN_PLATFORM', 'Platforma není podporována');

    try {
        if (action === 'install') {
            if (!adapter.lifecycle) return jsonError(404, 'NOT_SUPPORTED', 'Platforma nepodporuje instalaci');
            // Adapter exchanges the install code for credentials BEFORE we answer 200 (Shoptet requires this order).
            const result = await adapter.lifecycle.install(request);
            const tenantId = await withDatabase(env, ctx, (db) => buildServices(db, env, platforms).lifecycle.install(platform, result));
            // Slow follow-up (webhook registration, signing key) runs after we have already answered 200.
            if (adapter.lifecycle.afterInstall) {
                ctx.waitUntil(withDatabase(env, ctx, async (db) => {
                    const s = buildServices(db, env, platforms);
                    const extra = await adapter.lifecycle!.afterInstall!({ tenantId, integrationMode: 'api', credentials: s.credentials });
                    if (extra && Object.keys(extra).length > 0) {
                        const current = (await s.credentials.get(tenantId)) ?? {};
                        await s.credentials.put(tenantId, { ...current, ...extra });
                    }
                }).catch((error) => workerLogger.error('afterInstall failed', { platform, tenantId, error: error instanceof Error ? error.message : 'Unknown error' })));
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
        }

        if (!adapter.webhooks) return jsonError(404, 'NOT_SUPPORTED', 'Platforma nepodporuje webhooky');
        const events = await withDatabase(env, ctx, async (db) => {
            const s = buildServices(db, env, platforms);
            return adapter.webhooks!.verifyAndParse(request, async (shopId) => {
                const tenantId = await s.tenants.findByPlatformShop(platform, shopId);
                if (!tenantId) return undefined;
                const credentials = await s.credentials.get(tenantId);
                return credentials ? { tenantId, credentials } : undefined;
            });
        });
        if (events === null) return jsonError(401, 'INVALID_SIGNATURE', 'Neověřený webhook');
        // Answer fast; process in the background (platforms time out / retry slow webhooks).
        ctx.waitUntil(processPlatformEvents(events, env, ctx, platforms).catch((error) =>
            workerLogger.error('Webhook processing failed', { platform, error: error instanceof Error ? error.message : 'Unknown error' })));
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
    } catch (error) {
        workerLogger.error('Platform route failed', { platform, action, error: error instanceof Error ? error.message : 'Unknown error' });
        return jsonError(500, 'INTERNAL', 'Interní chyba serveru');
    }
}

/** Platform-neutral reaction to normalised events. Idempotent: event IDs become workflow event IDs. */
export async function processPlatformEvents(events: PlatformEvent[], env: BackendEnv, ctx: WaitUntil, platforms: PlatformRegistry): Promise<void> {
    await withDatabase(env, ctx, async (db) => {
        const s = buildServices(db, env, platforms);
        const replan = new Map<string, string>();
        for (const event of events) {
            if (event.type === 'APP_UNINSTALLED') { await s.lifecycle.uninstall(event.tenantId); replan.delete(event.tenantId); continue; }
            if (event.orderId) await syncOrder(s, platforms, event);
            replan.set(event.tenantId, event.eventId);
        }
        for (const [tenantId, eventId] of replan) {
            const tenant = await s.tenants.getTenant(tenantId);
            if (!tenant?.enabled) continue;
            const workflow = await s.pipelineFor(tenant);
            await workflow?.createPlan(tenantId, `webhook:${eventId}`, { approvalMode: tenant.approvalMode });
        }
    });
}

/**
 * Keeps the warehouse copy of one order in sync with the platform (platform-neutral).
 * Uses the adapter's order source when available, otherwise only cancels / re-checks payment.
 */
async function syncOrder(s: ReturnType<typeof buildServices>, platforms: PlatformRegistry, event: PlatformEvent): Promise<void> {
    const orderId = event.orderId!;
    const existing = await s.fulfillmentRepository.get(event.tenantId, orderId);
    const tenant = await s.tenants.getTenant(event.tenantId);
    const adapter = tenant ? platforms.get(tenant.platform) : undefined;
    const source = adapter?.orders?.({ tenantId: event.tenantId, integrationMode: tenant!.integrationMode, credentials: s.credentials });

    if (!source) {
        if (existing && event.type === 'ORDER_CANCELLED') await s.fulfillment.cancel(event.tenantId, orderId);
        else if (existing) await s.fulfillment.refreshPayment(event.tenantId, orderId);
        return;
    }
    const order = event.type === 'ORDER_CANCELLED' ? undefined : await source.getOrder(orderId);
    if (!order || order.cancelled) {
        if (existing && existing.status !== 'SHIPPED' && existing.status !== 'CANCELLED') await s.fulfillment.cancel(event.tenantId, orderId);
        return;
    }
    if (order.lines.length === 0) return; // services only, nothing to purchase or pack
    await s.fulfillment.upsertOrder(event.tenantId, { orderId: order.orderId, lines: order.lines, paymentInfo: order.paymentInfo });
}

/** Cron Trigger entry point (wrangler.jsonc → triggers.crons). */
export async function handleScheduled(cron: string, scheduledTime: number, env: BackendEnv, ctx: WaitUntil): Promise<void> {
    await withDatabase(env, ctx, async (db) => {
        const s = buildServices(db, env, createPlatformRegistry(env as Record<string, unknown>, workerLogger));
        const scheduler = new ProcurementScheduler(s.tenants, s.pipelineFor, workerLogger);
        const when = new Date(scheduledTime);
        if (cron === CRON_SUPPLIER_STATUS) await scheduler.runSupplierStatusSync(when);
        else await scheduler.runPlanning(when);
    });
}

export const CRON_PLANNING = '*/15 * * * *';
export const CRON_SUPPLIER_STATUS = '5 * * * *';
