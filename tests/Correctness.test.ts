import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { ProcurementEngine } from '../src/core/procurement/ProcurementEngine.js';
import { ShoptetProcurementImportAdapter } from '../src/platform/shoptet/import/ShoptetProcurementImportAdapter.js';
import { PostgresProcurementRepository } from '../src/platform/persistence/PostgresProcurementRepository.js';

const offer = { supplierId: 'S', supplierSku: 'X', productId: 'P', variantId: 'V', availableQuantity: 100, unitPrice: 10, currency: 'CZK', leadTimeDays: 1, active: true };
const demand = (q: number, s = 0) => ({ id: 'L1', orderId: 'O1', productId: 'P', variantId: 'V', sku: 'P', quantity: q, ownStockQuantity: s, createdAt: '2026-01-01' });
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
