import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConcurrentModificationError } from '../src/core/fulfillment/FulfillmentService.js';
import { PostgresFulfillmentRepository } from '../src/platform/persistence/PostgresFulfillmentRepository.js';
import type { FulfillmentOrder } from '../src/core/fulfillment/types.js';

type Call = { sql: string; values: unknown[] };
const fakeDb = (respond: (sql: string, values: unknown[]) => { rowCount: number; rows?: unknown[] }) => {
    const calls: Call[] = [];
    return {
        calls,
        db: { transaction: async <T>(work: (tx: { query: (sql: string, values?: unknown[]) => Promise<any> }) => Promise<T>) => work({ query: async (sql: string, values: unknown[] = []) => { calls.push({ sql, values }); return respond(sql, values); } }) },
    };
};
const order: FulfillmentOrder = {
    orderId: 'O1', status: 'READY_TO_PACK', version: 3, paymentInfo: { paymentStatus: 'PAID', paymentMethod: 'CARD' },
    lines: [{ customerOrderLineId: 'L1', productId: 'P', variantId: 'V', sku: 'S', ean: 'E', orderedQuantity: 1, allocatedQuantity: 1, packedQuantity: 0 }],
};

describe('PostgresFulfillmentRepository', () => {
    it('update kontroluje tenant_id i verzi a vrací verzi + 1', async () => {
        const { db, calls } = fakeDb(() => ({ rowCount: 1 }));
        const saved = await new PostgresFulfillmentRepository(db).save('t1', order);
        expect(saved.version).toBe(4);
        expect(calls[0]!.sql).toMatch(/WHERE tenant_id = \$1 AND order_id = \$2 AND version = \$10/);
        expect(calls[0]!.values).toEqual(expect.arrayContaining(['t1', 'O1', 4, 3]));
        expect(calls[1]!.values[0]).toBe('t1');
    });
    it('zastaralá verze vyhodí ConcurrentModificationError', async () => {
        const { db } = fakeDb(() => ({ rowCount: 0 }));
        await expect(new PostgresFulfillmentRepository(db).save('t1', order)).rejects.toBeInstanceOf(ConcurrentModificationError);
    });
    it('nová objednávka (verze 0) se vloží', async () => {
        const { db, calls } = fakeDb(() => ({ rowCount: 1 }));
        await new PostgresFulfillmentRepository(db).save('t1', { ...order, version: 0 });
        expect(calls[0]!.sql).toMatch(/INSERT INTO fulfillment_orders/);
    });
    it('řádek patřící jiné objednávce je odmítnut', async () => {
        const { db } = fakeDb((sql) => ({ rowCount: sql.includes('fulfillment_order_lines') ? 0 : 1 }));
        await expect(new PostgresFulfillmentRepository(db).save('t1', order)).rejects.toThrow(/another order/);
    });
    it('všechna čtení filtrují podle tenant_id a načtou objednávku i s řádky', async () => {
        const { db, calls } = fakeDb((sql) => {
            if (sql.startsWith('SELECT DISTINCT')) return { rowCount: 1, rows: [{ order_id: 'O1' }] };
            if (sql.includes('FROM fulfillment_orders')) return { rowCount: 1, rows: [{ order_id: 'O1', status: 'PACKED', payment_status: 'COD', payment_method: 'COD', carrier: null, tracking_number: null, shipped_at: null, version: '2' }] };
            return { rowCount: 1, rows: [{ order_id: 'O1', customer_order_line_id: 'L1', product_id: 'P', variant_id: 'V', sku: 'S', ean: null, ordered_quantity: '1', allocated_quantity: '1', packed_quantity: '1' }] };
        });
        const [o] = await new PostgresFulfillmentRepository(db).findByCustomerLineIds('t1', ['L1']);
        expect(o).toMatchObject({ orderId: 'O1', status: 'PACKED', version: 2, paymentInfo: { paymentStatus: 'COD' }, lines: [{ packedQuantity: 1 }] });
        expect(o!.lines[0]).not.toHaveProperty('ean');
        for (const c of calls) expect(c.sql).toMatch(/tenant_id = \$1/);
    });
    it('migrace 005 má tenant_id v primárních klíčích a kontroly množství', () => {
        const sql = readFileSync(new URL('../migrations/005_fulfillment.sql', import.meta.url), 'utf8');
        expect(sql).toMatch(/PRIMARY KEY \(tenant_id, order_id\)/);
        expect(sql).toMatch(/PRIMARY KEY \(tenant_id, customer_order_line_id\)/);
        expect(sql).toMatch(/packed_quantity <= ordered_quantity/);
    });
});
