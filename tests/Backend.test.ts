import { describe, expect, test, vi } from 'vitest';
import { AdminApi, bearerTokenAuthenticator } from '../src/platform/http/AdminApi.js';
import { PgTransactionalSql } from '../src/platform/persistence/PgTransactionalSql.js';
import { ProcurementScheduler } from '../src/platform/operations/Scheduler.js';
import { PlatformRegistry, PlatformRoutedPaymentStatus } from '../src/core/platform/PlatformAdapter.js';
import type { PlatformAdapter, PlatformCredentialsPort } from '../src/core/platform/PlatformAdapter.js';
import { EncryptedPostgresCredentialsStore } from '../src/platform/persistence/EncryptedPostgresCredentialsStore.js';
import { TENANT_TABLES, TenantLifecycleService, tenantIdFor } from '../src/platform/operations/TenantLifecycle.js';
import { buildServices } from '../src/platform/cloudflare/backend.js';
import { ConcurrentModificationError } from '../src/core/fulfillment/FulfillmentService.js';
import { readFileSync } from 'node:fs';

const quiet = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const BASE = 'https://x.test/api/v1';

function makeApi(over: Partial<Record<string, any>> = {}) {
    const deps: any = {
        authenticate: async (r: Request) => (r.headers.get('Authorization') === 'Bearer ok' ? 'shopA' : null),
        dashboard: { getDashboardData: vi.fn().mockResolvedValue({ pending: [], exceptions: [], ready: [] }) },
        audit: { listAudit: vi.fn().mockResolvedValue([]) },
        fulfillment: {
            listReadyToPack: vi.fn().mockResolvedValue([]),
            scanForPacking: vi.fn().mockResolvedValue({ ok: true }),
            resetPacking: vi.fn(), ship: vi.fn().mockResolvedValue({ orderId: 'O1' }), shipMany: vi.fn().mockResolvedValue([]),
        },
        fulfillmentRepository: { get: vi.fn().mockResolvedValue(undefined) },
        workflow: { approvePurchaseOrders: vi.fn().mockResolvedValue([]), cancelPurchaseOrder: vi.fn(), overridePurchaseOrderSupplier: vi.fn(), updatePurchaseOrderLineQuantity: vi.fn() },
        logger: quiet,
        ...over,
    };
    return { api: new AdminApi(deps), deps };
}
const auth = { Authorization: 'Bearer ok' };
const jsonHeaders = { ...auth, 'Content-Type': 'application/json', 'Idempotency-Key': 'click-12345678' };

describe('AdminApi – krok 2', () => {
    test('bez authenticate nejde vytvořit (fail-closed)', () => {
        expect(() => new AdminApi({} as any)).toThrow(/authenticate/);
    });
    test('mimo /api/v1 vrací undefined (statický web)', async () => {
        expect(await makeApi().api.handle(new Request('https://x.test/chytry-nakupci/demo/'))).toBeUndefined();
    });
    test('nepřihlášený → 401 jednotný formát', async () => {
        const res = (await makeApi().api.handle(new Request(`${BASE}/dashboard`)))!;
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Nepřihlášeno' } });
    });
    test('tenant jen z přihlášení – parametr v URL se ignoruje', async () => {
        const { api, deps } = makeApi();
        const res = (await api.handle(new Request(`${BASE}/dashboard?tenantId=shopB`, { headers: auth })))!;
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(deps.dashboard.getDashboardData).toHaveBeenCalledWith('shopA');
    });
    test('404 / 405', async () => {
        const { api } = makeApi();
        expect((await api.handle(new Request(`${BASE}/nic`, { headers: auth })))!.status).toBe(404);
        const r = (await api.handle(new Request(`${BASE}/dashboard`, { method: 'DELETE', headers: auth })))!;
        expect(r.status).toBe(405);
        expect(r.headers.get('Allow')).toBe('GET');
    });
    test('mutace vyžaduje Idempotency-Key a JSON', async () => {
        const { api, deps } = makeApi();
        const body = JSON.stringify({ purchaseOrderIds: ['po1'] });
        expect((await api.handle(new Request(`${BASE}/purchase-orders/approve`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body })))!.status).toBe(400);
        expect((await api.handle(new Request(`${BASE}/purchase-orders/approve`, { method: 'POST', headers: { ...jsonHeaders, 'Content-Type': 'text/plain' }, body })))!.status).toBe(415);
        const ok = (await api.handle(new Request(`${BASE}/purchase-orders/approve`, { method: 'POST', headers: jsonHeaders, body })))!;
        expect(ok.status).toBe(200);
        expect(deps.workflow.approvePurchaseOrders).toHaveBeenCalledWith('shopA', 'api:click-12345678', ['po1']);
    });
    test('validace: velké tělo, neplatný JSON, neplatné ID, množství', async () => {
        const { api } = makeApi();
        const big = JSON.stringify({ code: 'x'.repeat(70_000) });
        expect((await api.handle(new Request(`${BASE}/fulfillment/orders/O1/scan`, { method: 'POST', headers: jsonHeaders, body: big })))!.status).toBe(413);
        expect((await api.handle(new Request(`${BASE}/fulfillment/orders/O1/scan`, { method: 'POST', headers: jsonHeaders, body: '{' })))!.status).toBe(400);
        expect((await api.handle(new Request(`${BASE}/purchase-orders/approve`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ purchaseOrderIds: ['<script>'] }) })))!.status).toBe(400);
        expect((await api.handle(new Request(`${BASE}/purchase-order-lines/L1`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ quantity: 1.5 }) })))!.status).toBe(400);
    });
    test('souběžná změna → 409, neznámá chyba → 500 bez detailů', async () => {
        const { api } = makeApi({ fulfillment: { ship: vi.fn().mockRejectedValue(new ConcurrentModificationError('O1')) } as any });
        expect((await api.handle(new Request(`${BASE}/fulfillment/orders/O1/ship`, { method: 'POST', headers: jsonHeaders, body: '{}' })))!.status).toBe(409);
        const { api: api2 } = makeApi({ dashboard: { getDashboardData: vi.fn().mockRejectedValue(new Error('SQL host db.internal')) } });
        const res = (await api2.handle(new Request(`${BASE}/dashboard`, { headers: auth })))!;
        expect(res.status).toBe(500);
        expect(await res.text()).not.toMatch(/db\.internal/);
    });
    test('detail objednávky 404', async () => {
        const res = (await makeApi().api.handle(new Request(`${BASE}/fulfillment/orders/O9`, { headers: auth })))!;
        expect(res.status).toBe(404);
    });
});

describe('Prozatímní Bearer přihlášení', () => {
    const token = 'a'.repeat(40);
    test('správný token → tenant, špatný / chybějící → null, nenakonfigurováno → null', async () => {
        const a = bearerTokenAuthenticator(token, 'shopA');
        expect(await a(new Request('https://x', { headers: { Authorization: `Bearer ${token}` } }))).toBe('shopA');
        expect(await a(new Request('https://x', { headers: { Authorization: 'Bearer nope' } }))).toBeNull();
        expect(await a(new Request('https://x'))).toBeNull();
        expect(await bearerTokenAuthenticator(undefined, 'shopA')(new Request('https://x', { headers: { Authorization: `Bearer ${token}` } }))).toBeNull();
        expect(await bearerTokenAuthenticator('short', 'shopA')(new Request('https://x', { headers: { Authorization: 'Bearer short' } }))).toBeNull();
    });
});

describe('PgTransactionalSql', () => {
    test('BEGIN/COMMIT a ROLLBACK při chybě', async () => {
        const log: string[] = [];
        const sql = new PgTransactionalSql({ query: async (q: string) => { log.push(q); return { rowCount: 0, rows: [] }; } });
        await sql.transaction(async (tx) => { await tx.query('SELECT 1'); });
        await expect(sql.transaction(async () => { throw new Error('x'); })).rejects.toThrow('x');
        expect(log).toEqual(['BEGIN', 'SELECT 1', 'COMMIT', 'BEGIN', 'ROLLBACK']);
    });
    test('souběžné transakce se neprolínají', async () => {
        const log: string[] = [];
        const sql = new PgTransactionalSql({ query: async (q: string) => { log.push(q); await new Promise((r) => setTimeout(r, 1)); return { rowCount: 0, rows: [] }; } });
        await Promise.all([sql.transaction((tx) => tx.query('A')), sql.transaction((tx) => tx.query('B'))]);
        expect(log).toEqual(['BEGIN', 'A', 'COMMIT', 'BEGIN', 'B', 'COMMIT']);
    });
});

describe('Plánovač', () => {
    const tenants = [
        { tenantId: 'a', platform: 'shoptet', integrationMode: 'api' as const, enabled: true, approvalMode: 'manual' as const },
        { tenantId: 'b', platform: 'jina', integrationMode: 'api' as const, enabled: true, approvalMode: 'automatic' as const },
        { tenantId: 'c', platform: 'nic', integrationMode: 'api' as const, enabled: true, approvalMode: 'manual' as const },
    ];
    test('chyba jednoho e-shopu nezastaví ostatní; bez adaptéru = přeskočeno; eventId z cron slotu', async () => {
        const createPlan = vi.fn().mockImplementation(async (t: string) => { if (t === 'a') throw new Error('boom'); });
        const s = new ProcurementScheduler({ listEnabledTenants: async () => tenants }, async (t) => (t.platform === 'nic' ? undefined : ({ createPlan } as any)), quiet);
        const sum = await s.runPlanning(new Date('2026-10-18T10:15:42Z'));
        expect(sum).toMatchObject({ ok: ['b'], failed: ['a'], skipped: ['c'], eventId: 'cron:plan:2026-10-18T10:15' });
        expect(createPlan).toHaveBeenCalledWith('b', 'cron:plan:2026-10-18T10:15', { approvalMode: 'automatic' });
    });
});

/** A made-up non-Shoptet platform: proves a new platform plugs in without touching the core. */
function fakePlatform(key: string, payment = vi.fn().mockResolvedValue({ paymentStatus: 'PAID', paymentMethod: 'CARD' })): PlatformAdapter {
    return {
        platform: key, supportedModes: ['api'],
        commerce: () => ({ fetchUnfulfilledOrderLines: async () => [] }),
        payments: () => ({ getPaymentInfo: payment }),
    };
}
const noCreds: PlatformCredentialsPort = { get: async () => undefined, put: async () => undefined, delete: async () => undefined };

describe('Obecné rozhraní platformy', () => {
    test('registr: neplatný / duplicitní klíč', () => {
        const r = new PlatformRegistry().register(fakePlatform('woocommerce'));
        expect(() => r.register(fakePlatform('woocommerce'))).toThrow(/already/);
        expect(() => r.register(fakePlatform('Bad Key'))).toThrow(/Invalid/);
        expect(r.list()).toEqual(['woocommerce']);
    });
    test('platba se ptá adaptéru platformy daného e-shopu; neznámo ⇒ undefined (zámek drží)', async () => {
        const payment = vi.fn().mockResolvedValue({ paymentStatus: 'PAID', paymentMethod: 'CARD' });
        const registry = new PlatformRegistry().register(fakePlatform('upgates', payment));
        const lookup = { getTenant: async (id: string) => (({
            t1: { tenantId: 't1', platform: 'upgates', integrationMode: 'api' as const, enabled: true },
            t2: { tenantId: 't2', platform: 'neexistuje', integrationMode: 'api' as const, enabled: true },
            t3: { tenantId: 't3', platform: 'upgates', integrationMode: 'api' as const, enabled: false },
        }) as any)[id] };
        const routed = new PlatformRoutedPaymentStatus(registry, lookup, noCreds);
        expect(await routed.getPaymentInfo('t1', 'O1')).toEqual({ paymentStatus: 'PAID', paymentMethod: 'CARD' });
        expect(await routed.getPaymentInfo('t2', 'O1')).toBeUndefined();
        expect(await routed.getPaymentInfo('t3', 'O1')).toBeUndefined();
        expect(await routed.getPaymentInfo('nikdo', 'O1')).toBeUndefined();
        expect(payment).toHaveBeenCalledTimes(1);
    });
    test('buildServices: pipeline jen pro platformu s adaptérem a podporovaným režimem', async () => {
        const db = { transaction: async (fn: any) => fn({ query: async () => ({ rowCount: 0, rows: [] }) }) };
        const s = buildServices(db as any, {}, new PlatformRegistry().register(fakePlatform('shopify')), quiet);
        expect(await s.pipelineFor({ tenantId: 'x', platform: 'shopify', integrationMode: 'api' })).toBeDefined();
        expect(await s.pipelineFor({ tenantId: 'x', platform: 'shopify', integrationMode: 'import' })).toBeUndefined();
        expect(await s.pipelineFor({ tenantId: 'x', platform: 'shoptet', integrationMode: 'api' })).toBeUndefined();
    });
});

describe('Šifrované přístupové údaje', () => {
    function memDb() {
        const rows = new Map<string, { iv: string; ciphertext: string }>();
        const db = { transaction: async (fn: any) => fn({ query: async (sql: string, p: any[]) => {
            if (sql.startsWith('SELECT')) { const r = rows.get(p[0]); return { rowCount: r ? 1 : 0, rows: r ? [r] : [] }; }
            if (sql.trim().startsWith('INSERT')) { rows.set(p[0], { iv: p[1], ciphertext: p[2] }); return { rowCount: 1, rows: [] }; }
            rows.delete(p[0]); return { rowCount: 1, rows: [] };
        } }) };
        return { rows, db: db as any };
    }
    const key = Buffer.alloc(32, 7).toString('base64');
    test('uloží jen šifrovaně, přečte zpět, smaže', async () => {
        const { rows, db } = memDb();
        const store = new EncryptedPostgresCredentialsStore(db, key);
        await store.put('t1', { oauthToken: 'TAJNE-123' });
        expect(JSON.stringify([...rows.values()])).not.toMatch(/TAJNE/);
        expect(await store.get('t1')).toEqual({ oauthToken: 'TAJNE-123' });
        await store.delete('t1');
        expect(await store.get('t1')).toBeUndefined();
    });
    test('šifrovaný text zkopírovaný k jinému e-shopu nejde dešifrovat', async () => {
        const { rows, db } = memDb();
        const store = new EncryptedPostgresCredentialsStore(db, key);
        await store.put('t1', { oauthToken: 'x' });
        rows.set('t2', rows.get('t1')!);
        await expect(store.get('t2')).rejects.toThrow();
    });
    test('špatná délka klíče', () => {
        const { db } = memDb();
        expect(() => new EncryptedPostgresCredentialsStore(db, Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
        expect(() => new EncryptedPostgresCredentialsStore(db, '%%%')).toThrow(/32 bytes/);
    });
});

describe('Instalace / odinstalace (GDPR)', () => {
    test('tenantId je deterministický a bezpečný', () => {
        expect(tenantIdFor('shoptet', '123456')).toBe('shoptet-123456');
        expect(tenantIdFor('woo', "a'; DROP")).toBe('woo-a___DROP');
    });
    test('odinstalace smaže data ze všech tabulek s tenant_id v jedné transakci', async () => {
        const calls: { sql: string; p: unknown[] }[] = [];
        let transactions = 0;
        const db = { transaction: async (fn: any) => { transactions++; return fn({ query: async (sql: string, p: unknown[]) => { calls.push({ sql, p }); return { rowCount: 1, rows: [] }; } }); } };
        await new TenantLifecycleService(db as any, noCreds, { append: vi.fn() }, quiet).uninstall('shoptet-1');
        expect(transactions).toBe(1);
        for (const t of [...TENANT_TABLES, 'tenant_credentials', 'tenants', 'procurement_purchase_order_lines', 'procurement_idempotency_keys']) {
            expect(calls.some((c) => c.sql.includes(`FROM ${t}`))).toBe(true);
        }
        expect(calls.every((c) => c.p.includes('shoptet-1') || c.p.includes('shoptet-1:%'))).toBe(true);
    });
    test('TENANT_TABLES pokrývá všechny tabulky s tenant_id v migracích', () => {
        const all = ['001_procurement_core', '002_sales_units', '005_fulfillment'].map((m) => readFileSync(new URL(`../migrations/${m}.sql`, import.meta.url), 'utf8')).join('\n');
        const withTenant = [...all.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+) \(([\s\S]*?)\n\);/g)].filter((m) => /\btenant_id\b/.test(m[2]!)).map((m) => m[1]);
        const dropped = ['procurement_ready_to_ship'];
        for (const t of withTenant) if (!dropped.includes(t!)) expect(TENANT_TABLES).toContain(t);
    });
});
