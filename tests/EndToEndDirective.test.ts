import { describe, test, expect, vi, beforeEach } from 'vitest';
import { ProcurementEngine } from '../src/core/procurement/ProcurementEngine.js';
import { ProcurementWorkflow } from '../src/core/procurement/Workflow.js';
import { SupplierSelectionEngine } from '../src/core/procurement/SupplierSelectionEngine.js';
import { MockShoptetOutboundAdapter } from '../src/platform/shoptet/ShoptetOutboundSync.js';
import type { CustomerOrderLine, SupplierOffer, PurchaseOrder, GoodsReceiptLine } from '../src/core/procurement/types.js';
import type { IdempotencyPort, AuditPort, LoggerPort } from '../src/core/procurement/ports.js';

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

describe('End-to-End Procurement Directives (Scenarios A through J)', () => {
    let idempotency: InMemoryIdempotency;
    let audit: AuditPort;
    let logger: LoggerPort;

    beforeEach(() => {
        idempotency = new InMemoryIdempotency();
        audit = { append: vi.fn().mockResolvedValue(undefined) };
        logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    });

    test('Scenario A: Customer order with stock available -> 0 procurement needed, ready for fulfillment', () => {
        const demand: CustomerOrderLine = {
            id: 'line-1',
            orderId: 'ORD-100',
            productId: 'PROD-A',
            variantId: 'VAR-A',
            sku: 'SKU-A',
            quantity: 5,
            ownStockQuantity: 5, // 100% available in stock
            createdAt: '2026-08-28T10:00:00Z',
        };

        const plan = ProcurementEngine.plan([demand], [], { approvalMode: 'automatic' }, 'evt-a');

        expect(plan.purchaseOrders).toHaveLength(0);
        expect(plan.unfulfilled).toHaveLength(0);
    });

    test('Scenario B: Customer order with shortage -> automatic supplier selection -> PO creation', () => {
        const demand: CustomerOrderLine = {
            id: 'line-2',
            orderId: 'ORD-101',
            productId: 'PROD-B',
            variantId: 'VAR-B',
            sku: 'SKU-B',
            quantity: 10,
            ownStockQuantity: 2, // shortage: 8
            createdAt: '2026-08-28T10:00:00Z',
        };

        const offers: SupplierOffer[] = [
            {
                supplierId: 'sup-alpha',
                supplierSku: 'SUP-B-1',
                productId: 'PROD-B',
                variantId: 'VAR-B',
                availableQuantity: 15,
                unitPrice: 50,
                currency: 'CZK',
                leadTimeDays: 2,
                active: true,
            },
        ];

        const plan = ProcurementEngine.plan([demand], offers, { approvalMode: 'automatic' }, 'evt-b');

        expect(plan.purchaseOrders).toHaveLength(1);
        const po = plan.purchaseOrders[0]!;
        expect(po.supplierId).toBe('sup-alpha');
        expect(po.lines).toHaveLength(1);
        expect(po.lines[0]!.quantity).toBe(8); // deficit correctly calculated
        expect(po.lines[0]!.customerOrderLineId).toBe('line-2');
    });

    test('Scenario C: Multi-supplier split procurement across two suppliers when one cannot cover all', () => {
        const demand: CustomerOrderLine = {
            id: 'line-3',
            orderId: 'ORD-102',
            productId: 'PROD-C',
            variantId: 'VAR-C',
            sku: 'SKU-C',
            quantity: 100,
            ownStockQuantity: 0, // deficit: 100
            createdAt: '2026-08-28T10:00:00Z',
        };

        const offers: SupplierOffer[] = [
            {
                supplierId: 'supplier-A',
                supplierSku: 'SUP-C-A',
                productId: 'PROD-C',
                variantId: 'VAR-C',
                availableQuantity: 60, // can only supply 60
                unitPrice: 10,
                currency: 'EUR',
                leadTimeDays: 1,
                active: true,
            },
            {
                supplierId: 'supplier-B',
                supplierSku: 'SUP-C-B',
                productId: 'PROD-C',
                variantId: 'VAR-C',
                availableQuantity: 50, // can supply remaining 40
                unitPrice: 12,
                currency: 'EUR',
                leadTimeDays: 2,
                active: true,
            },
        ];

        const plan = ProcurementEngine.plan([demand], offers, { approvalMode: 'automatic' }, 'evt-c');

        // Should generate 2 separate Purchase Orders
        expect(plan.purchaseOrders).toHaveLength(2);
        const poA = plan.purchaseOrders.find((p) => p.supplierId === 'supplier-A');
        const poB = plan.purchaseOrders.find((p) => p.supplierId === 'supplier-B');

        expect(poA).toBeDefined();
        expect(poA!.lines[0]!.quantity).toBe(60);

        expect(poB).toBeDefined();
        expect(poB!.lines[0]!.quantity).toBe(40);
        expect(plan.unfulfilled).toHaveLength(0);
    });

    test('Scenario D & E: Supplier PO receipt -> partial receipt -> remaining receipt -> auto allocation to customer line', () => {
        const orders: PurchaseOrder[] = [
            {
                id: 'po-100',
                supplierId: 'sup-alpha',
                status: 'SENT',
                lines: [
                    {
                        id: 'po-line-1',
                        supplierId: 'sup-alpha',
                        customerOrderLineId: 'cust-line-1',
                        productId: 'p-1',
                        variantId: 'v-1',
                        sku: 'sku-1',
                        supplierSku: 'sup-sku-1',
                        quantity: 10,
                        receivedQuantity: 0,
                        unitPrice: 100,
                        currency: 'CZK',
                        expectedLeadTimeDays: 2,
                    },
                ],
            },
        ];

        // Part 1: Partial delivery of 6 items
        const receipt1: GoodsReceiptLine[] = [
            { purchaseOrderId: 'po-100', procurementLineId: 'po-line-1', receivedQuantity: 6 },
        ];
        const alloc1 = ProcurementEngine.receive(orders, receipt1);

        expect(alloc1).toEqual([
            { customerOrderLineId: 'cust-line-1', allocatedQuantity: 6, fulfilled: false },
        ]);
        expect(orders[0]!.status).toBe('PARTIALLY_RECEIVED');

        // Part 2: Remaining delivery of 4 items
        const receipt2: GoodsReceiptLine[] = [
            { purchaseOrderId: 'po-100', procurementLineId: 'po-line-1', receivedQuantity: 4 },
        ];
        const alloc2 = ProcurementEngine.receive(orders, receipt2);

        expect(alloc2).toEqual([
            { customerOrderLineId: 'cust-line-1', allocatedQuantity: 4, fulfilled: true },
        ]);
        expect(orders[0]!.status).toBe('RECEIVED');
    });

    test('Scenario F: User overrides supplier selection on Purchase Order', async () => {
        const platform = { fetchUnfulfilledOrderLines: vi.fn() };
        const catalog = { fetchOffers: vi.fn() };
        const purchaseOrders = {
            savePlan: vi.fn(),
            markAsSent: vi.fn(),
            recordReceipt: vi.fn(),
            cancel: vi.fn(),
            approve: vi.fn(),
            updateStatus: vi.fn(),
            getOrdersByIds: vi.fn(),
            overrideSupplier: vi.fn().mockResolvedValue(undefined),
        };
        const supplierDispatch = { dispatchPurchaseOrder: vi.fn(), fetchStatusUpdates: vi.fn() };
        const readiness = { markReadyToShip: vi.fn() };

        const workflow = new ProcurementWorkflow(platform, catalog, purchaseOrders, supplierDispatch, readiness, idempotency, audit, logger);

        await workflow.overridePurchaseOrderSupplier('tenant-1', 'evt-override-1', 'po-123', 'new-supplier-XYZ');

        expect(purchaseOrders.overrideSupplier).toHaveBeenCalledWith('tenant-1', 'po-123', 'new-supplier-XYZ');
        expect(audit.append).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                type: 'MANUAL_OVERRIDE_PO_SUPPLIER',
                entityId: 'po-123',
                payload: { newSupplierId: 'new-supplier-XYZ', origin: 'MANUAL' },
            }),
        );
    });

    test('Scenario G: User edits PO line quantity manually', async () => {
        const platform = { fetchUnfulfilledOrderLines: vi.fn() };
        const catalog = { fetchOffers: vi.fn() };
        const purchaseOrders = {
            savePlan: vi.fn(),
            markAsSent: vi.fn(),
            recordReceipt: vi.fn(),
            cancel: vi.fn(),
            approve: vi.fn(),
            updateStatus: vi.fn(),
            getOrdersByIds: vi.fn(),
            updateLineQuantity: vi.fn().mockResolvedValue(undefined),
        };
        const supplierDispatch = { dispatchPurchaseOrder: vi.fn(), fetchStatusUpdates: vi.fn() };
        const readiness = { markReadyToShip: vi.fn() };

        const workflow = new ProcurementWorkflow(platform, catalog, purchaseOrders, supplierDispatch, readiness, idempotency, audit, logger);

        await workflow.updatePurchaseOrderLineQuantity('tenant-1', 'evt-edit-qty-1', 'line-xyz', 15);

        expect(purchaseOrders.updateLineQuantity).toHaveBeenCalledWith('tenant-1', 'line-xyz', 15);
        expect(audit.append).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                type: 'MANUAL_OVERRIDE_PO_LINE_QUANTITY',
                entityId: 'line-xyz',
                payload: { newQuantity: 15, origin: 'MANUAL' },
            }),
        );
    });

    test('Scenario H: Mock Shoptet outbound sync propagates READY_TO_FULFILL state safely', async () => {
        const mockShoptet = new MockShoptetOutboundAdapter(logger, audit);

        const result = await mockShoptet.syncOrderStatus('tenant-1', {
            orderId: 'ORD-999',
            customerOrderLineId: 'col-999',
            status: 'READY_TO_FULFILL',
            allocatedQuantity: 10,
            syncedAt: new Date().toISOString(),
        });

        expect(result.success).toBe(true);
        expect(result.externalSyncId).toContain('mock-sync-');
        expect(mockShoptet.getSyncedPayloads()).toHaveLength(1);
        expect(mockShoptet.getSyncedPayloads()[0]!.status).toBe('READY_TO_FULFILL');
        expect(audit.append).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                type: 'SHOPTET_OUTBOUND_SYNC_SUCCESS',
                entityId: 'ORD-999',
            }),
        );
    });

    test('Scenario I: Shoptet sync simulated network failure', async () => {
        const mockShoptet = new MockShoptetOutboundAdapter(logger, audit);
        mockShoptet.shouldFail = true;

        await expect(
            mockShoptet.syncOrderStatus('tenant-1', {
                orderId: 'ORD-ERR',
                customerOrderLineId: 'col-err',
                status: 'READY_TO_FULFILL',
                allocatedQuantity: 5,
                syncedAt: new Date().toISOString(),
            }),
        ).rejects.toThrow('Simulated Shoptet API network failure');
    });

    test('Scenario J: Duplicate events prevent duplicate PO creation and double execution', async () => {
        const platform = {
            fetchUnfulfilledOrderLines: vi.fn().mockResolvedValue([
                { id: 'l1', orderId: 'o1', productId: 'p1', variantId: 'v1', sku: 's1', quantity: 5, ownStockQuantity: 0, createdAt: '2026-01-01' },
            ]),
        };
        const catalog = {
            fetchOffers: vi.fn().mockResolvedValue([
                { supplierId: 'sup1', supplierSku: 'sku1', productId: 'p1', variantId: 'v1', availableQuantity: 10, unitPrice: 100, currency: 'CZK', leadTimeDays: 1, active: true },
            ]),
        };
        const purchaseOrders = {
            savePlan: vi.fn(),
            markAsSent: vi.fn(),
            recordReceipt: vi.fn(),
            cancel: vi.fn(),
            approve: vi.fn(),
            updateStatus: vi.fn(),
            getOrdersByIds: vi.fn(),
        };
        const supplierDispatch = {
            dispatchPurchaseOrder: vi.fn().mockResolvedValue({ externalId: 'ext-dispatch-1' }),
            fetchStatusUpdates: vi.fn(),
        };
        const readiness = { markReadyToShip: vi.fn() };

        const workflow = new ProcurementWorkflow(platform, catalog, purchaseOrders, supplierDispatch, readiness, idempotency, audit, logger);

        // Run 1: First plan execution
        const plan1 = await workflow.createPlan('tenant-1', 'duplicate-evt-1', { approvalMode: 'automatic' });
        expect(plan1).toBeDefined();
        expect(purchaseOrders.savePlan).toHaveBeenCalledTimes(1);

        // Run 2: Exact duplicate eventId -> should be skipped safely by IdempotencyPort
        const plan2 = await workflow.createPlan('tenant-1', 'duplicate-evt-1', { approvalMode: 'automatic' });
        expect(plan2).toBeUndefined();
        expect(purchaseOrders.savePlan).toHaveBeenCalledTimes(1); // No double plan saving!
    });
});
