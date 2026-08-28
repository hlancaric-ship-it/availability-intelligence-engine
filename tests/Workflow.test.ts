import { expect, test, vi, describe } from 'vitest';
import { ProcurementWorkflow } from '../src/core/procurement/Workflow.js';
import type { IdempotencyPort } from '../src/core/procurement/ports.js';
import type { PurchaseOrder, GoodsReceiptLine } from '../src/core/procurement/types.js';

class InMemoryIdempotency implements IdempotencyPort {
    public store = new Map<string, string>();
    async claim(key: string, operation: string) {
        const fullKey = `${key}:${operation}`;
        if (this.store.has(fullKey) && this.store.get(fullKey) !== 'FAILED') return false;
        this.store.set(fullKey, 'PROCESSING');
        return true;
    }
    async complete(key: string, operation: string) { this.store.set(`${key}:${operation}`, 'COMPLETED'); }
    async fail(key: string, operation: string) { this.store.set(`${key}:${operation}`, 'FAILED'); }
}

describe('ProcurementWorkflow Resilience', () => {
    test('scenario 1: retry after crash during dispatch never duplicates dispatch', async () => {
        const platform = { fetchUnfulfilledOrderLines: vi.fn().mockResolvedValue([{ id: 'req1', orderId: 'o1', productId: 'p', variantId: 'v', sku: 's', quantity: 5, ownStockQuantity: 0, createdAt: '2026-01-01' }]) };
        const catalog = { fetchOffers: vi.fn().mockResolvedValue([{ supplierId: 'sup1', supplierSku: 'sku', productId: 'p', variantId: 'v', availableQuantity: 10, unitPrice: 100, currency: 'CZK', leadTimeDays: 1, active: true }]) };
        const purchaseOrders = { savePlan: vi.fn(), markAsSent: vi.fn(), recordReceipt: vi.fn() };
        
        let dispatchCalls = 0;
        const supplierDispatch = { 
            dispatchPurchaseOrder: vi.fn().mockImplementation(async () => {
                dispatchCalls++;
                if (dispatchCalls === 1) throw new Error('Crash during first dispatch');
                return { externalId: 'ext-ok' };
            })
        };
        const readiness = { markReadyToShip: vi.fn() };
        const idempotency = new InMemoryIdempotency();
        const audit = { append: vi.fn() };
        const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

        const workflow = new ProcurementWorkflow(platform, catalog, purchaseOrders, supplierDispatch, readiness, idempotency, audit, logger);

        // First attempt - fails during dispatch
        await expect(workflow.createPlan('t1', 'evt-retry', { approvalMode: 'automatic' })).rejects.toThrow('Crash during first dispatch');
        expect(dispatchCalls).toBe(1);
        expect(purchaseOrders.markAsSent).not.toHaveBeenCalled();

        // Retry of the same event
        const plan = await workflow.createPlan('t1', 'evt-retry', { approvalMode: 'automatic' });
        expect(plan).toBeDefined();
        expect(dispatchCalls).toBe(2);
        expect(purchaseOrders.markAsSent).toHaveBeenCalledTimes(1);

        // Third attempt - already completed, idempotency blocks it
        const plan3 = await workflow.createPlan('t1', 'evt-retry', { approvalMode: 'automatic' });
        expect(plan3).toBeUndefined();
        expect(dispatchCalls).toBe(2); // no extra dispatches!
    });

    test('scenario 2: parallel PO generation (concurrency lock)', async () => {
        const platform = { fetchUnfulfilledOrderLines: vi.fn().mockResolvedValue([]) };
        const catalog = { fetchOffers: vi.fn().mockResolvedValue([]) };
        const purchaseOrders = { savePlan: vi.fn(), markAsSent: vi.fn(), recordReceipt: vi.fn() };
        const supplierDispatch = { dispatchPurchaseOrder: vi.fn() };
        const readiness = { markReadyToShip: vi.fn() };
        const idempotency = new InMemoryIdempotency();
        const audit = { append: vi.fn() };
        const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

        const workflow = new ProcurementWorkflow(platform, catalog, purchaseOrders, supplierDispatch, readiness, idempotency, audit, logger);

        // Run concurrently
        const results = await Promise.all([
            workflow.createPlan('t1', 'evt-parallel', { approvalMode: 'automatic' }),
            workflow.createPlan('t1', 'evt-parallel', { approvalMode: 'automatic' }),
            workflow.createPlan('t1', 'evt-parallel', { approvalMode: 'automatic' })
        ]);

        const successful = results.filter(r => r !== undefined);
        expect(successful).toHaveLength(1); // Only one succeeded in claiming the event
    });

    test('scenario 3: partial and duplicate receiving prevents overallocation', async () => {
        const platform = { fetchUnfulfilledOrderLines: vi.fn() };
        const catalog = { fetchOffers: vi.fn() };
        
        const orders: PurchaseOrder[] = [{
            id: 'po1',
            supplierId: 'sup1',
            status: 'SENT',
            lines: [{
                id: 'line1', supplierId: 'sup1', customerOrderLineId: 'req1',
                productId: 'p1', variantId: 'v1', sku: 's1', supplierSku: 'sup-s1',
                quantity: 10, receivedQuantity: 0, unitPrice: 100, currency: 'CZK', expectedLeadTimeDays: 1
            }]
        }];
        
        const purchaseOrders = { savePlan: vi.fn(), markAsSent: vi.fn(), recordReceipt: vi.fn(), getOrdersByIds: vi.fn().mockResolvedValue(orders) };
        const supplierDispatch = { dispatchPurchaseOrder: vi.fn() };
        const readiness = { markReadyToShip: vi.fn() };
        const idempotency = new InMemoryIdempotency();
        const audit = { append: vi.fn() };
        const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

        const workflow = new ProcurementWorkflow(platform, catalog, purchaseOrders, supplierDispatch, readiness, idempotency, audit, logger);

        // Partial receipt of 6 items
        const alloc1 = await workflow.receive('t1', 'rcv-1', [{ purchaseOrderId: 'po1', procurementLineId: 'line1', receivedQuantity: 6 }]);
        expect(alloc1).toEqual([{ customerOrderLineId: 'req1', allocatedQuantity: 6, fulfilled: false }]);
        expect(orders[0].lines[0].receivedQuantity).toBe(6);

        // Duplicate receipt event (idempotency triggers, returns empty)
        const allocDuplicate = await workflow.receive('t1', 'rcv-1', [{ purchaseOrderId: 'po1', procurementLineId: 'line1', receivedQuantity: 6 }]);
        expect(allocDuplicate).toEqual([]);
        expect(orders[0].lines[0].receivedQuantity).toBe(6); // unchanged

        // Another receipt of 6 items (only 4 remain)
        const alloc2 = await workflow.receive('t1', 'rcv-2', [{ purchaseOrderId: 'po1', procurementLineId: 'line1', receivedQuantity: 6 }]);
        expect(alloc2).toEqual([{ customerOrderLineId: 'req1', allocatedQuantity: 4, fulfilled: true }]); // Only 4 allocated!
        expect(orders[0].lines[0].receivedQuantity).toBe(10); // Capped at 10

        // Trying to receive more (0 remain)
        const alloc3 = await workflow.receive('t1', 'rcv-3', [{ purchaseOrderId: 'po1', procurementLineId: 'line1', receivedQuantity: 5 }]);
        expect(alloc3).toEqual([]); // 0 allocated
        expect(orders[0].lines[0].receivedQuantity).toBe(10);
    });
});
