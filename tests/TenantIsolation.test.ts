import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ProcurementWorkflow } from '../src/core/procurement/Workflow.js';
import { PostgresProcurementRepository } from '../src/platform/persistence/PostgresProcurementRepository.js';
import { PostgresDashboardReader } from '../src/platform/operations/DashboardEndpoint.js';

const offer = { supplierId: 'S', supplierSku: 'X', productId: 'P', variantId: 'V', availableQuantity: 100, unitPrice: 10, currency: 'CZK', leadTimeDays: 1, active: true };
const line = { id: 'L1', orderId: 'O1', productId: 'P', variantId: 'V', sku: 'P', quantity: 2, ownStockQuantity: 0, paymentInfo: { paymentStatus: 'PAID' as const, paymentMethod: 'CARD' as const }, createdAt: 'x' };
const logger = { info() {}, warn: vi.fn(), error() {} };

function makeWorkflow(overrides: { repo?: any; dispatch?: any; keys?: Set<string> } = {}) {
    const keys = overrides.keys ?? new Set<string>();
    const saved: any[] = [];
    const repo = overrides.repo ?? { savePlan: async (t: string, p: any) => saved.push({ t, p }), markAsSent: vi.fn(), updateStatus: vi.fn(), getOrderedQuantityByCustomerLine: async () => new Map() };
    const dispatch = overrides.dispatch ?? { dispatchPurchaseOrder: async () => ({ externalId: 'SUP-777' }), fetchStatusUpdates: async () => [] };
    const wf = new ProcurementWorkflow(
        { fetchUnfulfilledOrderLines: async () => [line] } as any, { fetchOffers: async () => [offer] } as any, repo, dispatch,
        { markReadyToShip: vi.fn() } as any,
        { claim: async (k: string, o: string) => { const key = `${k}|${o}`; if (keys.has(key)) return false; keys.add(key); return true; }, complete: async () => {}, fail: async () => {} } as any,
        { append: vi.fn() } as any, logger as any,
    );
    return { wf, saved, repo, keys };
}

describe('K7: izolace e-shopů', () => {
    test('stejný eventId u dvou e-shopů: oba naplánují a PO mají různá ID', async () => {
        const keys = new Set<string>();
        const a = makeWorkflow({ keys });
        const b = makeWorkflow({ keys });
        await a.wf.createPlan('shopA', 'cron-10:00', { approvalMode: 'automatic' } as any);
        await b.wf.createPlan('shopB', 'cron-10:00', { approvalMode: 'automatic' } as any);
        expect(a.saved).toHaveLength(1);
        expect(b.saved).toHaveLength(1);
        const idA = a.saved[0].p.purchaseOrders[0].id, idB = b.saved[0].p.purchaseOrders[0].id;
        expect(idA).not.toBe(idB);
        expect(a.saved[0].p.purchaseOrders[0].lines[0].id).not.toBe(b.saved[0].p.purchaseOrders[0].lines[0].id);
    });
    test('idempotency klíče mají prefix tenanta', async () => {
        const { wf, keys } = makeWorkflow();
        await wf.createPlan('shopA', 'ev1', { approvalMode: 'automatic' } as any);
        expect([...keys].every((k) => k.startsWith('shopA:'))).toBe(true);
    });
    test('dashboard čte READY_TO_SHIP jen pro daný e-shop', async () => {
        const queries: { sql: string; params?: unknown[] }[] = [];
        const db = { transaction: async (fn: any) => fn({ query: async (sql: string, params?: unknown[]) => { queries.push({ sql, params }); return { rows: [] }; } }) } as any;
        await new PostgresDashboardReader(db).getDashboardData('shopA');
        const ready = queries.find((q) => q.sql.includes('procurement_ready_to_ship'))!;
        expect(ready.sql).toMatch(/WHERE tenant_id = \$1/);
        expect(ready.params).toEqual(['shopA']);
    });
    test('migrace 004 přidává tenant_id do ready_to_ship a external_id do PO', () => {
        const sql = readFileSync(new URL('../migrations/004_tenant_isolation_and_external_ids.sql', import.meta.url), 'utf8');
        expect(sql).toMatch(/procurement_ready_to_ship ADD COLUMN tenant_id/);
        expect(sql).toMatch(/PRIMARY KEY \(tenant_id, customer_order_line_id\)/);
        expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS external_id/);
    });
});

describe('K6: stavy od dodavatele', () => {
    test('při odeslání se uloží externí ID dodavatele', async () => {
        const { wf, repo } = makeWorkflow();
        await wf.createPlan('shopA', 'ev', { approvalMode: 'automatic' } as any);
        expect(repo.markAsSent).toHaveBeenCalledWith('shopA', expect.stringContaining('po-S-'), 'SUP-777');
    });
    test('update s externím ID se dohledá přes external_id, ne jako naše PO ID', async () => {
        const repo = { updateStatus: vi.fn(), updateStatusByExternalId: vi.fn().mockResolvedValue(true) };
        const { wf } = makeWorkflow({ repo, dispatch: { fetchStatusUpdates: async () => [{ externalId: 'SUP-777', supplierId: 'S', status: 'SHIPPED' }] } });
        await wf.syncSupplierStatus('shopA', 'sync1');
        expect(repo.updateStatusByExternalId).toHaveBeenCalledWith('shopA', 'SUP-777', 'SHIPPED', 'S');
        expect(repo.updateStatus).not.toHaveBeenCalled();
    });
    test('když dodavatel pošle naše PO ID, použije se přímo', async () => {
        const repo = { updateStatus: vi.fn(), updateStatusByExternalId: vi.fn() };
        const { wf } = makeWorkflow({ repo, dispatch: { fetchStatusUpdates: async () => [{ externalId: 'X', purchaseOrderId: 'po-1', status: 'ACCEPTED' }] } });
        await wf.syncSupplierStatus('shopA', 'sync2');
        expect(repo.updateStatus).toHaveBeenCalledWith('shopA', 'po-1', 'ACCEPTED');
    });
    test('neznámé externí ID se zaloguje a nepadá', async () => {
        const repo = { updateStatus: vi.fn(), updateStatusByExternalId: vi.fn().mockResolvedValue(false) };
        const { wf } = makeWorkflow({ repo, dispatch: { fetchStatusUpdates: async () => [{ externalId: 'NOPE', status: 'ACCEPTED' }] } });
        await expect(wf.syncSupplierStatus('shopA', 'sync3')).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalled();
    });
    test('repository: update podle external_id je omezen na tenanta', async () => {
        let q: any;
        const db = { transaction: async (fn: any) => fn({ query: async (sql: string, params: unknown[]) => { q = { sql, params }; return { rowCount: 1 }; } }) } as any;
        expect(await new PostgresProcurementRepository(db).updateStatusByExternalId('shopA', 'SUP-1', 'SHIPPED')).toBe(true);
        expect(q.sql).toMatch(/tenant_id = \$2 AND external_id = \$3/);
        expect(q.params).toEqual(['SHIPPED', 'shopA', 'SUP-1', null]);
    });
});
