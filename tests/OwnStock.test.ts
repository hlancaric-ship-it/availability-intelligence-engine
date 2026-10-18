import { describe, expect, test, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { ProcurementEngine } from '../src/core/procurement/ProcurementEngine.js';
import { ProcurementWorkflow } from '../src/core/procurement/Workflow.js';
import { FulfillmentEngine } from '../src/core/fulfillment/FulfillmentEngine.js';
import { FulfillmentService } from '../src/core/fulfillment/FulfillmentService.js';
import type { FulfillmentOrder } from '../src/core/fulfillment/types.js';
import type { CustomerOrderLine } from '../src/core/procurement/types.js';
import { PostgresFulfillmentRepository } from '../src/platform/persistence/PostgresFulfillmentRepository.js';
import { PostgresProcurementRepository } from '../src/platform/persistence/PostgresProcurementRepository.js';
import type { SqlQueryResult, TransactionalSql } from '../src/platform/persistence/PostgresProcurementRepository.js';

const PAID = { paymentStatus: 'PAID' as const, paymentMethod: 'CARD' as const };
const UNPAID = { paymentStatus: 'UNPAID' as const, paymentMethod: 'BANK_TRANSFER' as const };
const quiet = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function demand(id: string, qty: number, stock: number, createdAt: string, paymentInfo = PAID): CustomerOrderLine {
    return { id, orderId: id.split(':')[0]!, productId: 'P', variantId: 'V', sku: 'SKU-1', quantity: qty, ownStockQuantity: stock, createdAt, paymentInfo };
}
function order(id: string, lines: Array<[string, number]>, extra: Partial<FulfillmentOrder> = {}): FulfillmentOrder {
    return {
        orderId: id, status: 'WAITING_FOR_STOCK', version: 1, paymentInfo: PAID,
        lines: lines.map(([lineId, qty]) => ({ customerOrderLineId: lineId, productId: 'P', variantId: 'V', sku: 'SKU-1', orderedQuantity: qty, allocatedQuantity: 0, packedQuantity: 0 })),
        ...extra,
    };
}

describe('Plán: rezervace vlastního skladu', () => {
    test('sklad se dělí od nejstarší objednávky; nezaplacená dostane 0; nic se nekupuje, co je skladem', () => {
        const plan = ProcurementEngine.plan([
            demand('A:1', 2, 3, '2026-01-01'),
            demand('B:1', 2, 3, '2026-01-02'),
            demand('C:1', 1, 3, '2026-01-03', UNPAID),
        ], [], { approvalMode: 'manual' }, 'ev');
        expect(plan.ownStockReservations).toEqual([
            { customerOrderLineId: 'A:1', quantity: 2 },
            { customerOrderLineId: 'B:1', quantity: 1 },
            { customerOrderLineId: 'C:1', quantity: 0 },
        ]);
    });
});

describe('Sklad expedice: applyOwnStock', () => {
    test('objednávka plně krytá vlastním skladem a zaplacená → připravena k balení', () => {
        const next = FulfillmentEngine.applyOwnStock(order('A', [['A:1', 2]]), new Map([['A:1', 2]]));
        expect(next.status).toBe('READY_TO_PACK');
        expect(next.lines[0]).toMatchObject({ allocatedQuantity: 2, ownStockAllocated: 2 });
    });
    test('opakovaný běh plánovače nic nezdvojí (absolutní hodnota)', () => {
        const once = FulfillmentEngine.applyOwnStock(order('A', [['A:1', 5]]), new Map([['A:1', 2]]));
        const twice = FulfillmentEngine.applyOwnStock(once, new Map([['A:1', 2]]));
        expect(twice).toBe(once);
        expect(twice.lines[0]!.allocatedQuantity).toBe(2);
    });
    test('vlastní sklad + zboží od dodavatele se sčítá; snížení skladu před balením objednávku znovu zamkne', () => {
        let o = FulfillmentEngine.applyOwnStock(order('A', [['A:1', 3]]), new Map([['A:1', 1]]));
        o = FulfillmentEngine.applyAllocations(o, [{ customerOrderLineId: 'A:1', allocatedQuantity: 2, fulfilled: true }]);
        expect(o.status).toBe('READY_TO_PACK');
        o = FulfillmentEngine.applyOwnStock(o, new Map([['A:1', 0]])); // kus mezitím prodán jinde
        expect(o.lines[0]).toMatchObject({ allocatedQuantity: 2, ownStockAllocated: 0 });
        expect(o.status).toBe('WAITING_FOR_STOCK');
    });
    test('po začátku balení se rezervace už nemění', () => {
        const packing = order('A', [['A:1', 1]], { status: 'PACKING' });
        packing.lines[0]!.allocatedQuantity = 1; packing.lines[0]!.ownStockAllocated = 1; packing.lines[0]!.packedQuantity = 0;
        expect(FulfillmentEngine.applyOwnStock(packing, new Map([['A:1', 0]]))).toBe(packing);
    });
    test('nezaplacená objednávka zůstane zamčená i se skladem', () => {
        const next = FulfillmentEngine.applyOwnStock(order('A', [['A:1', 1]], { paymentInfo: UNPAID }), new Map([['A:1', 1]]));
        expect(next.status).toBe('AWAITING_PAYMENT');
    });
    test('rezervace nikdy nepřesáhne objednané množství; záporná hodnota je chyba', () => {
        expect(FulfillmentEngine.applyOwnStock(order('A', [['A:1', 2]]), new Map([['A:1', 9]])).lines[0]!.allocatedQuantity).toBe(2);
        expect(() => FulfillmentEngine.applyOwnStock(order('A', [['A:1', 2]]), new Map([['A:1', -1]]))).toThrow();
    });
});

describe('Workflow předá rezervace do skladu', () => {
    test('createPlan → reserveOwnStock', async () => {
        const readiness = { markReadyToShip: vi.fn(), reserveOwnStock: vi.fn() };
        const idem = { claim: vi.fn().mockResolvedValue(true), complete: vi.fn(), fail: vi.fn() };
        const wf = new ProcurementWorkflow(
            { fetchUnfulfilledOrderLines: async () => [demand('A:1', 1, 1, '2026-01-01')] },
            { fetchOffers: async () => [] },
            { savePlan: vi.fn(), markAsSent: vi.fn(), recordReceipt: vi.fn(), getOrdersByIds: vi.fn(), cancel: vi.fn(), approve: vi.fn(), updateStatus: vi.fn() },
            { dispatchPurchaseOrder: vi.fn(), fetchStatusUpdates: vi.fn() }, readiness, idem, { append: vi.fn() }, quiet);
        await wf.createPlan('t', 'ev', { approvalMode: 'manual' });
        expect(readiness.reserveOwnStock).toHaveBeenCalledWith('t', [{ customerOrderLineId: 'A:1', quantity: 1 }]);
    });
});

describe('Celý průchod proti skutečnému PostgreSQL', () => {
    async function db(): Promise<{ pg: PGlite; sql: TransactionalSql }> {
        const pg = new PGlite();
        const dir = new URL('../migrations/', import.meta.url);
        for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await pg.exec(readFileSync(new URL(f, dir), 'utf8'));
        const sql: TransactionalSql = {
            transaction: (work) => pg.transaction(async (tx) => work({
                query: async <T>(q: string, v?: unknown[]): Promise<SqlQueryResult<T>> => {
                    const r = await tx.query<T>(q, v as any[]);
                    return { rowCount: r.affectedRows ?? r.rows.length, rows: r.rows };
                },
            })),
        };
        return { pg, sql };
    }

    test('objednávka krytá vlastním skladem se uvolní k balení, opakovaný běh nic nezdvojí, nic se nenakoupí', async () => {
        const { pg, sql } = await db();
        const repo = new PostgresFulfillmentRepository(sql);
        const procurement = new PostgresProcurementRepository(sql);
        const fulfillment = new FulfillmentService(repo, { getPaymentInfo: async () => PAID }, procurement, quiet);
        await fulfillment.upsertOrder('t', { orderId: 'A', paymentInfo: PAID, lines: [{ customerOrderLineId: 'A:1', productId: 'P', variantId: 'V', sku: 'SKU-1', orderedQuantity: 2, allocatedQuantity: 0, packedQuantity: 0 }] });

        const dispatch = { dispatchPurchaseOrder: vi.fn(), fetchStatusUpdates: vi.fn() };
        const wf = new ProcurementWorkflow({ fetchUnfulfilledOrderLines: async () => [demand('A:1', 2, 5, '2026-01-01')] },
            { fetchOffers: async () => [] }, procurement, dispatch, fulfillment, procurement, procurement, quiet);

        for (const ev of ['cron:1', 'cron:2', 'cron:3']) await wf.createPlan('t', ev, { approvalMode: 'automatic' });

        const stored = await repo.get('t', 'A');
        expect(stored!.status).toBe('READY_TO_PACK');
        expect(stored!.lines[0]).toMatchObject({ allocatedQuantity: 2, ownStockAllocated: 2 });
        expect(dispatch.dispatchPurchaseOrder).not.toHaveBeenCalled();
        expect(Number((await pg.query<{ n: string }>('SELECT COUNT(*) AS n FROM procurement_purchase_orders')).rows[0]!.n)).toBe(0);

        // Balení skenerem teď projde.
        expect((await fulfillment.scanForPacking('t', 'A', 'sku-1')).ok).toBe(true);
        await pg.close();
    }, 30_000);
});
