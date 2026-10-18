import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { ProcurementEngine } from '../src/core/procurement/ProcurementEngine.js';
import { ShoptetProcurementImportAdapter } from '../src/platform/shoptet/import/ShoptetProcurementImportAdapter.js';
import { PostgresProcurementRepository } from '../src/platform/persistence/PostgresProcurementRepository.js';

const offer = { supplierId: 'S', supplierSku: 'X', productId: 'P', variantId: 'V', availableQuantity: 100, unitPrice: 10, currency: 'CZK', leadTimeDays: 1, active: true };
const demand = (q: number, s = 0) => ({ id: 'L1', orderId: 'O1', productId: 'P', variantId: 'V', sku: 'P', quantity: q, ownStockQuantity: s, paymentInfo: { paymentStatus: 'PAID' as const, paymentMethod: 'CARD' as const }, createdAt: '2026-01-01' });
const row = (quantity: string, stockQuantity = '0') => ({ itemId: 'i', orderCode: 'o', productGuid: 'P', variantGuid: 'V', code: 'c', quantity, stockQuantity, createdAt: 'x' });

describe('Validace poptávky', () => {
    test.each([NaN, -1, 1.5])('engine odmítne quantity=%s (dřív vznikl nákup s množstvím NaN)', (q) => {
        expect(() => ProcurementEngine.plan([demand(q)], [offer], { approvalMode: 'automatic' } as any, 'r')).toThrow(/quantity/);
    });
    test.each(['abc', '', '-2', '1.5'])('import adapter odmítne quantity=%j', async (q) => {
        await expect(new ShoptetProcurementImportAdapter([row(q)]).fetchUnfulfilledOrderLines()).rejects.toThrow();
    });
    test('validní import projde', async () => {
        const [line] = await new ShoptetProcurementImportAdapter([row('3', '1')]).fetchUnfulfilledOrderLines();
        expect(line).toMatchObject({ quantity: 3, ownStockQuantity: 1 });
    });
});

describe('Idempotence po chybě', () => {
    test('claim umožní znovu převzít klíč ve stavu FAILED', async () => {
        let sql = '';
        const db = { transaction: async (fn: any) => fn({ query: async (s: string) => { sql = s; return { rowCount: 1, rows: [] }; } }) } as any;
        await new PostgresProcurementRepository(db).claim('k', 'op');
        expect(sql).toMatch(/DO UPDATE SET state = 'PROCESSING'.*WHERE procurement_idempotency_keys\.state = 'FAILED'/s);
    });
});

describe('Migrace', () => {
    test('status constraint pokrývá všechny stavy, které kód zapisuje', () => {
        const sql = readFileSync(new URL('../migrations/003_status_constraint_fix.sql', import.meta.url), 'utf8');
        for (const s of ['DRAFT', 'PENDING_APPROVAL', 'SENT', 'ACCEPTED', 'SHIPPED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'COMPLETED', 'CANCELLED']) expect(sql).toContain(`'${s}'`);
    });
});

import { ProcurementWorkflow } from '../src/core/procurement/Workflow.js';

const line = (id: string, q: number, stock: number, createdAt: string, variantId = 'V') =>
    ({ id, orderId: id, productId: 'P', variantId, sku: 'P', quantity: q, ownStockQuantity: stock, paymentInfo: { paymentStatus: 'PAID' as const, paymentMethod: 'CARD' as const }, createdAt });
const total = (plan: ReturnType<typeof ProcurementEngine.plan>) => plan.purchaseOrders.flatMap((p) => p.lines).reduce((s, l) => s + l.quantity, 0);
const auto = { approvalMode: 'automatic' } as any;

describe('K2: vlastní sklad je sdílený mezi objednávkami (1a)', () => {
    test('2 objednávky po 3 ks, skladem 3 ks → nakoupí 3 ks pro novější objednávku', () => {
        const plan = ProcurementEngine.plan([line('NEW', 3, 3, '2026-01-02'), line('OLD', 3, 3, '2026-01-01')], [offer], auto, 'r1');
        expect(total(plan)).toBe(3);
        expect(plan.purchaseOrders[0]!.lines[0]!.customerOrderLineId).toBe('NEW'); // nejstarší dostane sklad
    });
    test('sklad jedné varianty neovlivní jinou variantu', () => {
        const offerW = { ...offer, variantId: 'W', supplierSku: 'Y' };
        const plan = ProcurementEngine.plan([line('A', 2, 2, '2026-01-01'), line('B', 2, 0, '2026-01-01', 'W')], [offer, offerW], auto, 'r');
        expect(total(plan)).toBe(2);
    });
    test('nesouhlasí-li hodnoty skladu, použije se nižší (konzervativně)', () => {
        const plan = ProcurementEngine.plan([line('A', 5, 5, '2026-01-01'), line('B', 1, 2, '2026-01-02')], [offer], auto, 'r');
        // sklad = min(5, 2) = 2 → A (starší) dostane 2 ks a dokoupí 3, B dokoupí 1
        expect(total(plan)).toBe(4);
    });
});

describe('K1: žádný dvojí nákup (2a)', () => {
    test('už objednané množství se odečte', () => {
        expect(total(ProcurementEngine.plan([line('L1', 5, 0, 'x')], [offer], auto, 'r2', new Map([['L1', 5]])))).toBe(0);
        expect(total(ProcurementEngine.plan([line('L1', 5, 0, 'x')], [offer], auto, 'r2', new Map([['L1', 2]])))).toBe(3);
    });
    test('doobjednání zbytku má nové ID řádku (nezahodí ho ON CONFLICT)', () => {
        const a = ProcurementEngine.plan([line('L1', 5, 0, 'x')], [offer], auto, 'r1').purchaseOrders[0]!.lines[0]!.id;
        const b = ProcurementEngine.plan([line('L1', 5, 0, 'x')], [offer], auto, 'r2', new Map([['L1', 2]])).purchaseOrders[0]!.lines[0]!.id;
        expect(a).not.toBe(b);
    });
    test('workflow: dva plánovací běhy po sobě objednají jen jednou', async () => {
        const saved: any[] = [];
        const dispatched: any[] = [];
        const repo = {
            savePlan: async (_t: string, plan: any) => { saved.push(...plan.purchaseOrders.flatMap((p: any) => p.lines)); },
            markAsSent: async () => {},
            getOrderedQuantityByCustomerLine: async (_t: string, ids: string[]) =>
                new Map(ids.map((id) => [id, saved.filter((l) => l.customerOrderLineId === id).reduce((s, l) => s + l.quantity, 0)])),
        };
        const keys = new Set<string>();
        const wf = new ProcurementWorkflow(
            { fetchUnfulfilledOrderLines: async () => [line('L1', 5, 0, 'x')] } as any,
            { fetchOffers: async () => [offer] } as any, repo as any,
            { dispatchPurchaseOrder: async (o: any) => { dispatched.push(o); return { externalId: 'e' }; } } as any, {} as any,
            { claim: async (k: string, o: string) => !keys.has(k + o) && !!keys.add(k + o), complete: async () => {}, fail: async () => {} } as any,
            { append: async () => {} }, { info() {}, warn() {}, error() {} },
        );
        await wf.createPlan('t', 'run-1', auto);
        await wf.createPlan('t', 'run-2', auto);
        expect(dispatched).toHaveLength(1);
        expect(saved.reduce((s, l) => s + l.quantity, 0)).toBe(5);
    });
    test('repository: dotaz je omezen na tenanta a ignoruje zrušené PO', async () => {
        let q: { sql: string; params: unknown[] } | undefined;
        const db = { transaction: async (fn: any) => fn({ query: async (sql: string, params: unknown[]) => { q = { sql, params }; return { rows: [{ customer_order_line_id: 'L1', ordered: '4' }] }; } }) } as any;
        const res = await new PostgresProcurementRepository(db).getOrderedQuantityByCustomerLine('tA', ['L1']);
        expect(res.get('L1')).toBe(4);
        expect(q!.sql).toMatch(/po\.tenant_id = \$1/);
        expect(q!.sql).toMatch(/<> 'CANCELLED'/);
        expect(q!.params[0]).toBe('tA');
    });
});
