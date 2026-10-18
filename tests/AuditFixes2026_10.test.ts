import { describe, expect, test, vi } from 'vitest';
import { ProcurementWorkflow } from '../src/core/procurement/Workflow.js';
import { PostgresProcurementRepository } from '../src/platform/persistence/PostgresProcurementRepository.js';
import { ShoptetReadOnlyClient } from '../src/platform/shoptet/api/ShoptetReadOnlyClient.js';
import { MockShoptetOutboundAdapter, redactSyncPayload } from '../src/platform/shoptet/ShoptetOutboundSync.js';

class Idem {
    private s = new Map<string, string>();
    async claim(k: string, o: string) { const key = `${k}|${o}`; const st = this.s.get(key); if (st && st !== 'FAILED') return false; this.s.set(key, 'PROCESSING'); return true; }
    async complete(k: string, o: string) { this.s.set(`${k}|${o}`, 'COMPLETED'); }
    async fail(k: string, o: string) { this.s.set(`${k}|${o}`, 'FAILED'); }
}

const po = { id: 'po1', supplierId: 's', status: 'PENDING_APPROVAL', lines: [] } as any;
const quiet = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('Schválení nákupu – žádné dvojí odeslání dodavateli', () => {
    test('dvě schválení stejného PO s různým eventId odešlou objednávku jen jednou', async () => {
        const dispatch = { dispatchPurchaseOrder: vi.fn().mockResolvedValue({ externalId: 'E1' }), fetchStatusUpdates: vi.fn() };
        const repo = { savePlan: vi.fn(), markAsSent: vi.fn(), recordReceipt: vi.fn(), cancel: vi.fn(), approve: vi.fn(), updateStatus: vi.fn(), getOrdersByIds: vi.fn().mockResolvedValue([po]) };
        const wf = new ProcurementWorkflow({ fetchUnfulfilledOrderLines: vi.fn() }, { fetchOffers: vi.fn() }, repo, dispatch, { markReadyToShip: vi.fn() }, new Idem(), { append: vi.fn() }, quiet);
        await wf.approvePurchaseOrder('t', 'click-1', 'po1');
        await expect(wf.approvePurchaseOrder('t', 'click-2', 'po1')).rejects.toThrow(/already/);
        expect(dispatch.dispatchPurchaseOrder).toHaveBeenCalledTimes(1);
    });

    test('po selhání odeslání lze schválení zopakovat', async () => {
        const dispatch = { dispatchPurchaseOrder: vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue({ externalId: 'E1' }), fetchStatusUpdates: vi.fn() };
        const repo = { savePlan: vi.fn(), markAsSent: vi.fn(), recordReceipt: vi.fn(), cancel: vi.fn(), approve: vi.fn(), updateStatus: vi.fn(), getOrdersByIds: vi.fn().mockResolvedValue([po]) };
        const wf = new ProcurementWorkflow({ fetchUnfulfilledOrderLines: vi.fn() }, { fetchOffers: vi.fn() }, repo, dispatch, { markReadyToShip: vi.fn() }, new Idem(), { append: vi.fn() }, quiet);
        await expect(wf.approvePurchaseOrder('t', 'e1', 'po1')).rejects.toThrow('down');
        await wf.approvePurchaseOrder('t', 'e1', 'po1');
        expect(dispatch.dispatchPurchaseOrder).toHaveBeenCalledTimes(2);
        expect(repo.markAsSent).toHaveBeenCalledTimes(1);
    });
});

describe('Repository – stavové přechody', () => {
    function db(rowCount: number) {
        const calls: string[] = [];
        return { calls, db: { transaction: async (fn: any) => fn({ query: async (sql: string) => { calls.push(sql); return { rowCount, rows: [] }; } }) } as any };
    }
    test('ruční změna množství / dodavatele jen u neodeslaných PO, jinak chyba', async () => {
        const { calls, db: d } = db(0);
        const r = new PostgresProcurementRepository(d);
        await expect(r.updateLineQuantity('t', 'L1', 3)).rejects.toThrow(/no longer editable/);
        await expect(r.overrideSupplier('t', 'PO1', 'S2')).rejects.toThrow(/no longer editable/);
        for (const sql of calls) expect(sql).toMatch(/status IN \('DRAFT','PENDING_APPROVAL'\)/);
    });
    test('stav od dodavatele neotevře zrušený / přijatý PO', async () => {
        const { calls, db: d } = db(1);
        const r = new PostgresProcurementRepository(d);
        await r.updateStatus('t', 'PO1', 'SHIPPED');
        await r.updateStatusByExternalId('t', 'X', 'ACCEPTED');
        for (const sql of calls) expect(sql).toMatch(/status NOT IN \('CANCELLED','RECEIVED','COMPLETED'\)/);
    });
});

describe('Shoptet klient', () => {
    test('posílá Content-Type application/vnd.shoptet.v1.0', async () => {
        const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { orders: [], paginator: { pageCount: 1 } } }), { status: 200 }));
        await new ShoptetReadOnlyClient('tok', undefined, request as any).listOrders();
        expect(request.mock.calls[0]![1].headers['Content-Type']).toBe('application/vnd.shoptet.v1.0');
    });
    test('Retry-After jako HTTP datum', async () => {
        const sleep = vi.fn().mockResolvedValue(undefined);
        const when = new Date(Date.now() + 5_000).toUTCString();
        const request = vi.fn()
            .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': when } }))
            .mockResolvedValue(new Response(JSON.stringify({ data: { orders: [], paginator: { pageCount: 1 } } }), { status: 200 }));
        await new ShoptetReadOnlyClient('tok', undefined, request as any, { sleep }).listOrders();
        expect(sleep.mock.calls[0]![0]).toBeGreaterThan(1_000);
        expect(sleep.mock.calls[0]![0]).toBeLessThanOrEqual(5_000);
    });
});

describe('G4 – částky platby se nelogují', () => {
    test('log ani audit neobsahují paidAmount / totalAmount', async () => {
        const payload = { orderId: 'o', customerOrderLineId: 'l', status: 'READY_TO_FULFILL' as const, allocatedQuantity: 1, syncedAt: 'x', paymentInfo: { paymentStatus: 'PAID' as const, paymentMethod: 'CARD' as const, paidAmount: 999, totalAmount: 999 } };
        expect(JSON.stringify(redactSyncPayload(payload))).not.toMatch(/Amount/);
        const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        const audit = { append: vi.fn() };
        await new MockShoptetOutboundAdapter(logger, audit).syncOrderStatus('t', payload);
        expect(JSON.stringify([logger.info.mock.calls, audit.append.mock.calls])).not.toMatch(/Amount/);
    });
});
