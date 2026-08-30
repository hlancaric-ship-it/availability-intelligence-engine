import { describe, test, expect, vi } from 'vitest';
import { PostgresProcurementRepository } from '../src/platform/persistence/PostgresProcurementRepository.js';
import type { SqlTransaction, SqlQueryResult } from '../src/platform/persistence/PostgresProcurementRepository.js';

function createMockDb(rows: unknown[]) {
    const tx: SqlTransaction = {
        query: vi.fn().mockResolvedValue({ rowCount: rows.length, rows } as SqlQueryResult<unknown>),
    };
    const db = {
        transaction: vi.fn().mockImplementation(async (fn: (t: SqlTransaction) => Promise<unknown>) => fn(tx)),
        tx,
    };
    return db;
}

describe('PostgresProcurementRepository - Phase 2 getOrdersByIds', () => {
    test('returns empty array when orderIds is empty without querying DB', async () => {
        const db = createMockDb([]);
        const repo = new PostgresProcurementRepository(db);

        const result = await repo.getOrdersByIds('tenant-1', []);

        expect(result).toEqual([]);
        expect(db.transaction).not.toHaveBeenCalled();
    });

    test('fetches single purchase order with multiple lines correctly', async () => {
        const mockRows = [
            {
                po_id: 'po-1',
                supplier_id: 'sup-1',
                status: 'DRAFT',
                line_id: 'line-1',
                purchase_order_id: 'po-1',
                customer_order_line_id: 'col-1',
                product_id: 'prod-1',
                variant_id: 'var-1',
                supplier_sku: 'sku-1',
                quantity: '5',
                received_quantity: '2',
                unit_price: '100.50',
                currency: 'CZK',
            },
            {
                po_id: 'po-1',
                supplier_id: 'sup-1',
                status: 'DRAFT',
                line_id: 'line-2',
                purchase_order_id: 'po-1',
                customer_order_line_id: 'col-2',
                product_id: 'prod-2',
                variant_id: 'var-2',
                supplier_sku: 'sku-2',
                quantity: 10,
                received_quantity: 0,
                unit_price: 50,
                currency: 'CZK',
            },
        ];

        const db = createMockDb(mockRows);
        const repo = new PostgresProcurementRepository(db);

        const result = await repo.getOrdersByIds('tenant-1', ['po-1']);

        expect(db.transaction).toHaveBeenCalledTimes(1);
        expect(db.tx.query).toHaveBeenCalledWith(
            expect.stringContaining('WHERE po.tenant_id = $1 AND po.id IN ($2)'),
            ['tenant-1', 'po-1'],
        );

        expect(result).toHaveLength(1);
        const po = result[0]!;
        expect(po.id).toBe('po-1');
        expect(po.supplierId).toBe('sup-1');
        expect(po.status).toBe('DRAFT');
        expect(po.lines).toHaveLength(2);

        expect(po.lines[0]).toEqual({
            id: 'line-1',
            supplierId: 'sup-1',
            customerOrderLineId: 'col-1',
            productId: 'prod-1',
            variantId: 'var-1',
            sku: '',
            supplierSku: 'sku-1',
            quantity: 5,
            receivedQuantity: 2,
            unitPrice: 100.5,
            currency: 'CZK',
            expectedLeadTimeDays: 0,
        });

        expect(po.lines[1]).toEqual({
            id: 'line-2',
            supplierId: 'sup-1',
            customerOrderLineId: 'col-2',
            productId: 'prod-2',
            variantId: 'var-2',
            sku: '',
            supplierSku: 'sku-2',
            quantity: 10,
            receivedQuantity: 0,
            unitPrice: 50,
            currency: 'CZK',
            expectedLeadTimeDays: 0,
        });
    });

    test('handles PO with no lines (LEFT JOIN null row)', async () => {
        const mockRows = [
            {
                po_id: 'po-empty',
                supplier_id: 'sup-2',
                status: 'SENT',
                line_id: null,
                purchase_order_id: null,
                customer_order_line_id: null,
                product_id: null,
                variant_id: null,
                supplier_sku: null,
                quantity: null,
                received_quantity: null,
                unit_price: null,
                currency: null,
            },
        ];

        const db = createMockDb(mockRows);
        const repo = new PostgresProcurementRepository(db);

        const result = await repo.getOrdersByIds('tenant-1', ['po-empty']);

        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe('po-empty');
        expect(result[0]!.supplierId).toBe('sup-2');
        expect(result[0]!.status).toBe('SENT');
        expect(result[0]!.lines).toEqual([]);
    });

    test('groups multiple POs and binds correct parameter placeholders', async () => {
        const mockRows = [
            {
                po_id: 'po-A',
                supplier_id: 'sup-A',
                status: 'RECEIVED',
                line_id: 'line-A1',
                purchase_order_id: 'po-A',
                customer_order_line_id: 'col-A1',
                product_id: 'pA',
                variant_id: 'vA',
                supplier_sku: 'sA',
                quantity: 1,
                received_quantity: 1,
                unit_price: 10,
                currency: 'EUR',
            },
            {
                po_id: 'po-B',
                supplier_id: 'sup-B',
                status: 'PENDING_APPROVAL',
                line_id: 'line-B1',
                purchase_order_id: 'po-B',
                customer_order_line_id: 'col-B1',
                product_id: 'pB',
                variant_id: 'vB',
                supplier_sku: 'sB',
                quantity: 2,
                received_quantity: 0,
                unit_price: 20,
                currency: 'EUR',
            },
        ];

        const db = createMockDb(mockRows);
        const repo = new PostgresProcurementRepository(db);

        const result = await repo.getOrdersByIds('tenant-1', ['po-A', 'po-B']);

        expect(db.tx.query).toHaveBeenCalledWith(
            expect.stringContaining('WHERE po.tenant_id = $1 AND po.id IN ($2,$3)'),
            ['tenant-1', 'po-A', 'po-B'],
        );

        expect(result).toHaveLength(2);
        expect(result.find((p) => p.id === 'po-A')?.lines).toHaveLength(1);
        expect(result.find((p) => p.id === 'po-B')?.lines).toHaveLength(1);
    });
});
