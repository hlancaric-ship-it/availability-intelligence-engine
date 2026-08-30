import { describe, expect, test } from 'vitest';
import { ProcurementEngine } from '../src/core/procurement/ProcurementEngine.js';
import type { CustomerOrderLine, SupplierOffer } from '../src/core/procurement/types.js';

const demand = (id: string, variantId: string, quantity: number, ownStockQuantity = 0): CustomerOrderLine => ({
    id, orderId: `order-${id}`, productId: 'product-1', variantId, sku: `SKU-${variantId}`,
    quantity, ownStockQuantity, createdAt: '2026-08-28T10:00:00.000Z',
});
const offer = (supplierId: string, variantId: string, availableQuantity: number, unitPrice: number, leadTimeDays: number): SupplierOffer => ({
    supplierId, supplierSku: `${supplierId}-${variantId}`, productId: 'product-1', variantId, availableQuantity,
    unitPrice, currency: 'CZK', leadTimeDays, active: true,
});

describe('ProcurementEngine', () => {
    test('uses exact variants, allocates own stock first, groups orders and auto-sends', () => {
        const plan = ProcurementEngine.plan(
            [demand('a', 'blue-xl', 5, 2), demand('b', 'red-xl', 2)],
            [offer('fast', 'blue-xl', 10, 120, 1), offer('cheap', 'blue-xl', 10, 90, 4), offer('fast', 'red-xl', 10, 100, 1)],
            { approvalMode: 'automatic', speedWeight: 15 },
            'event-123'
        );
        expect(plan.unfulfilled).toEqual([]);
        expect(plan.purchaseOrders).toHaveLength(1);
        expect(plan.purchaseOrders[0]?.supplierId).toBe('fast');
        expect(plan.purchaseOrders[0]?.status).toBe('DRAFT');
        expect(plan.purchaseOrders[0]?.lines.map((line) => [line.variantId, line.quantity])).toEqual([['blue-xl', 3], ['red-xl', 2]]);
    });

    test('respects supplier capacity across demands and explains unfulfilled demand', () => {
        const plan = ProcurementEngine.plan(
            [demand('first', 'blue-xl', 3), demand('second', 'blue-xl', 3)],
            [offer('supplier', 'blue-xl', 4, 10, 1)],
            { approvalMode: 'manual' },
            'event-456'
        );
        expect(plan.purchaseOrders[0]?.status).toBe('PENDING_APPROVAL');
        expect(plan.purchaseOrders[0]?.lines[0]?.quantity).toBe(3);
        expect(plan.unfulfilled).toMatchObject([{ customerOrderLineId: 'second', quantity: 2, reason: 'INSUFFICIENT_SUPPLIER_STOCK' }]);
    });

    test('receipt allocates only ordered quantities back to the original order line', () => {
        const plan = ProcurementEngine.plan([demand('a', 'blue-xl', 2)], [offer('supplier', 'blue-xl', 10, 10, 1)], { approvalMode: 'manual' }, 'evt');
        const order = plan.purchaseOrders[0]!;
        const line = order.lines[0]!;
        expect(ProcurementEngine.receive([order], [{ purchaseOrderId: order.id, procurementLineId: line.id, receivedQuantity: 1 }]))
            .toEqual([{ customerOrderLineId: 'a', allocatedQuantity: 1, fulfilled: false }]);
        expect(order.status).toBe('PARTIALLY_RECEIVED');
        expect(ProcurementEngine.receive([order], [{ purchaseOrderId: order.id, procurementLineId: line.id, receivedQuantity: 5 }]))
            .toEqual([{ customerOrderLineId: 'a', allocatedQuantity: 1, fulfilled: true }]);
        expect(order.status).toBe('RECEIVED');
    });
});
