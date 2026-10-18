import { ProcurementEngine } from './ProcurementEngine.js';
import { runBulk } from '../fulfillment/FulfillmentService.js';
import type { AuditPort, CommercePlatformPort, FulfillmentReadinessPort, IdempotencyPort, PurchaseOrderPort, SupplierCatalogPort, SupplierDispatchPort, LoggerPort } from './ports.js';
import type { GoodsReceiptLine, ProcurementPolicy, PurchaseOrder } from './types.js';

export class ProcurementWorkflow {
    public constructor(
        private readonly platform: CommercePlatformPort,
        private readonly catalog: SupplierCatalogPort,
        private readonly purchaseOrders: PurchaseOrderPort,
        private readonly supplierDispatch: SupplierDispatchPort,
        private readonly readiness: FulfillmentReadinessPort,
        private readonly idempotency: IdempotencyPort,
        private readonly audit: AuditPort,
        private readonly logger: LoggerPort,
    ) {}

    // Idempotency keys are namespaced per tenant so two shops with the same event/PO ID never block each other.
    private idem_claim(tenantId: string, key: string, op: string) { return this.idempotency.claim(`${tenantId}:${key}`, op); }
    private idem_complete(tenantId: string, key: string, op: string) { return this.idempotency.complete(`${tenantId}:${key}`, op); }
    private idem_fail(tenantId: string, key: string, op: string) { return this.idempotency.fail(`${tenantId}:${key}`, op); }

    public async createPlan(tenantId: string, eventId: string, policy: ProcurementPolicy) {
        if (!await this.idem_claim(tenantId, eventId, 'PROCUREMENT_PLAN')) {
            this.logger.info('Procurement plan run skipped (idempotent)', { tenantId, eventId });
            return undefined;
        }
        try {
            this.logger.info('Starting procurement planning', { tenantId, eventId });
            const demands = await this.platform.fetchUnfulfilledOrderLines();
            if (!this.purchaseOrders.getOrderedQuantityByCustomerLine) {
                this.logger.warn('PurchaseOrderPort has no getOrderedQuantityByCustomerLine – duplicate purchasing across runs is possible', { tenantId, eventId });
            }
            const alreadyOrdered = this.purchaseOrders.getOrderedQuantityByCustomerLine
                ? await this.purchaseOrders.getOrderedQuantityByCustomerLine(tenantId, demands.map((d) => d.id))
                : new Map<string, number>();
            const plan = ProcurementEngine.plan(demands, await this.catalog.fetchOffers(), policy, `${tenantId}:${eventId}`, alreadyOrdered) // tenant-scoped PO/line IDs;
            await this.purchaseOrders.savePlan(tenantId, plan);
            // Own stock promised to paid orders goes to the warehouse, so orders covered from stock get released for packing.
            if (plan.ownStockReservations && this.readiness.reserveOwnStock) {
                await this.readiness.reserveOwnStock(tenantId, plan.ownStockReservations);
            } else if (plan.ownStockReservations?.some((r) => r.quantity > 0)) {
                this.logger.warn('FulfillmentReadinessPort has no reserveOwnStock – orders covered from own stock stay locked', { tenantId, eventId });
            }
            this.logger.info('Procurement plan created', { tenantId, eventId, newOrders: plan.purchaseOrders.length, unfulfilledCount: plan.unfulfilled.length });
            await this.audit.append({ tenantId, type: 'PROCUREMENT_PLAN_CREATED', entityId: eventId, payload: { purchaseOrders: plan.purchaseOrders.length, unfulfilled: plan.unfulfilled }, occurredAt: new Date().toISOString() });

            for (const order of plan.purchaseOrders.filter((candidate: PurchaseOrder) => candidate.status === 'DRAFT')) {
                if (!await this.idem_claim(tenantId, order.id, 'DISPATCH_PO')) {
                    this.logger.info('PO dispatch skipped (idempotent)', { tenantId, eventId, orderId: order.id });
                    continue;
                }
                try {
                    this.logger.info('Dispatching PO', { tenantId, eventId, orderId: order.id, supplierId: order.supplierId });
                    const result = await this.supplierDispatch.dispatchPurchaseOrder(order);
                    await this.purchaseOrders.markAsSent(tenantId, order.id, result.externalId);
                    await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_DISPATCHED', entityId: eventId, payload: { orderId: order.id, externalId: result.externalId }, occurredAt: new Date().toISOString() });
                    await this.idem_complete(tenantId, order.id, 'DISPATCH_PO');
                    this.logger.info('PO dispatched successfully', { tenantId, eventId, orderId: order.id });
                } catch (error) {
                    const safeError = error instanceof Error ? error.message : 'Unknown error';
                    this.logger.error('Failed to dispatch PO', { tenantId, eventId, orderId: order.id, error: safeError });
                    await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_DISPATCH_FAILED', entityId: eventId, payload: { orderId: order.id, error: safeError }, occurredAt: new Date().toISOString() });
                    await this.idem_fail(tenantId, order.id, 'DISPATCH_PO');
                    throw error;
                }
            }
            await this.idem_complete(tenantId, eventId, 'PROCUREMENT_PLAN');
            this.logger.info('Procurement planning completed', { tenantId, eventId });
            return plan;
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Procurement plan failed', { tenantId, eventId, error: safeError });
            await this.idem_fail(tenantId, eventId, 'PROCUREMENT_PLAN');
            await this.audit.append({ tenantId, type: 'PROCUREMENT_PLAN_FAILED', entityId: eventId, payload: { error: safeError }, occurredAt: new Date().toISOString() });
            throw error;
        }
    }

    public async receive(tenantId: string, eventId: string, receipt: GoodsReceiptLine[]) {
        if (!await this.idem_claim(tenantId, eventId, 'GOODS_RECEIPT')) {
            this.logger.info('Goods receipt skipped (idempotent)', { tenantId, eventId });
            return [];
        }
        try {
            this.logger.info('Processing goods receipt', { tenantId, eventId, receiptLines: receipt.length });
            const orderIds = Array.from(new Set(receipt.map((r) => r.purchaseOrderId)));
            const orders = await this.purchaseOrders.getOrdersByIds(tenantId, orderIds);
            const allocations = ProcurementEngine.receive(orders, receipt);
            await this.purchaseOrders.recordReceipt(tenantId, receipt);
            await this.readiness.markReadyToShip(tenantId, allocations);
            await this.audit.append({ tenantId, type: 'GOODS_RECEIVED', entityId: eventId, payload: { allocationsCount: allocations.length }, occurredAt: new Date().toISOString() });
            await this.idem_complete(tenantId, eventId, 'GOODS_RECEIPT');
            this.logger.info('Goods receipt completed', { tenantId, eventId, allocationsCreated: allocations.length });
            return allocations;
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Goods receipt failed', { tenantId, eventId, error: safeError });
            await this.idem_fail(tenantId, eventId, 'GOODS_RECEIPT');
            await this.audit.append({ tenantId, type: 'GOODS_RECEIPT_FAILED', entityId: eventId, payload: { error: safeError }, occurredAt: new Date().toISOString() });
            throw error;
        }
    }

    public async cancelPurchaseOrder(tenantId: string, eventId: string, purchaseOrderId: string) {
        if (!await this.idem_claim(tenantId, eventId, 'CANCEL_PO')) {
            this.logger.info('PO cancellation skipped (idempotent)', { tenantId, eventId, purchaseOrderId });
            return;
        }
        try {
            this.logger.info('Cancelling PO', { tenantId, eventId, purchaseOrderId });
            await this.purchaseOrders.cancel(tenantId, purchaseOrderId);
            await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_CANCELLED', entityId: eventId, payload: { purchaseOrderId }, occurredAt: new Date().toISOString() });
            await this.idem_complete(tenantId, eventId, 'CANCEL_PO');
            this.logger.info('PO cancelled successfully', { tenantId, eventId, purchaseOrderId });
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to cancel PO', { tenantId, eventId, purchaseOrderId, error: safeError });
            await this.idem_fail(tenantId, eventId, 'CANCEL_PO');
            await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_CANCELLATION_FAILED', entityId: eventId, payload: { purchaseOrderId, error: safeError }, occurredAt: new Date().toISOString() });
            throw error;
        }
    }

    public async approvePurchaseOrder(tenantId: string, eventId: string, purchaseOrderId: string) {
        if (!await this.idem_claim(tenantId, eventId, 'APPROVE_PO')) {
            this.logger.info('PO approval skipped (idempotent)', { tenantId, eventId, purchaseOrderId });
            return;
        }
        let dispatchClaimed = false;
        try {
            this.logger.info('Approving PO', { tenantId, eventId, purchaseOrderId });
            await this.purchaseOrders.approve(tenantId, purchaseOrderId);
            // Per-PO dispatch lock: two approvals with different eventIds (double click, two users, bulk + single)
            // must never send the same PO to the supplier twice. approve() alone is only a status check.
            if (!await this.idem_claim(tenantId, purchaseOrderId, 'DISPATCH_PO')) {
                throw new Error(`Purchase order ${purchaseOrderId} is already being dispatched or was dispatched`);
            }
            dispatchClaimed = true;
            const orders = await this.purchaseOrders.getOrdersByIds(tenantId, [purchaseOrderId]);
            if (orders.length === 0) throw new Error(`Purchase order ${purchaseOrderId} not found`);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const order = orders[0]!;
            const result = await this.supplierDispatch.dispatchPurchaseOrder(order);
            await this.purchaseOrders.markAsSent(tenantId, purchaseOrderId, result.externalId);
            await this.idem_complete(tenantId, purchaseOrderId, 'DISPATCH_PO');
            dispatchClaimed = false;
            await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_APPROVED', entityId: eventId, payload: { purchaseOrderId, externalId: result.externalId }, occurredAt: new Date().toISOString() });
            await this.idem_complete(tenantId, eventId, 'APPROVE_PO');
            this.logger.info('PO approved and dispatched', { tenantId, eventId, purchaseOrderId });
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to approve PO', { tenantId, eventId, purchaseOrderId, error: safeError });
            if (dispatchClaimed) await this.idem_fail(tenantId, purchaseOrderId, 'DISPATCH_PO');
            await this.idem_fail(tenantId, eventId, 'APPROVE_PO');
            await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_APPROVAL_FAILED', entityId: eventId, payload: { purchaseOrderId, error: safeError }, occurredAt: new Date().toISOString() });
            throw error;
        }
    }

    /** Bulk approval ("Schválit vše"). Each PO gets its own idempotency key `<eventId>:<poId>`; failures don't stop others. */
    public approvePurchaseOrders(tenantId: string, eventId: string, purchaseOrderIds: readonly string[]) {
        return runBulk(purchaseOrderIds, (id) => this.approvePurchaseOrder(tenantId, `${eventId}:${id}`, id));
    }

    public async syncSupplierStatus(tenantId: string, eventId: string) {
        if (!await this.idem_claim(tenantId, eventId, 'SYNC_SUPPLIER_STATUS')) {
            this.logger.info('Supplier status sync skipped (idempotent)', { tenantId, eventId });
            return;
        }
        try {
            this.logger.info('Syncing supplier status', { tenantId, eventId });
            const updates = await this.supplierDispatch.fetchStatusUpdates();
            for (const update of updates) {
                let purchaseOrderId: string | undefined = update.purchaseOrderId;
                if (purchaseOrderId) {
                    await this.purchaseOrders.updateStatus(tenantId, purchaseOrderId, update.status);
                } else if (this.purchaseOrders.updateStatusByExternalId) {
                    const matched = await this.purchaseOrders.updateStatusByExternalId(tenantId, update.externalId, update.status, update.supplierId);
                    if (!matched) {
                        this.logger.warn('Supplier status update for unknown external order ID', { tenantId, eventId, externalId: update.externalId, supplierId: update.supplierId });
                        await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_STATUS_UNMATCHED', entityId: eventId, payload: { externalId: update.externalId, status: update.status }, occurredAt: new Date().toISOString() });
                        continue;
                    }
                } else {
                    // Legacy fallback: the adapter reports our PO ID in externalId.
                    purchaseOrderId = update.externalId;
                    await this.purchaseOrders.updateStatus(tenantId, purchaseOrderId, update.status);
                }
                await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_STATUS_UPDATED', entityId: eventId, payload: { purchaseOrderId: purchaseOrderId ?? null, externalId: update.externalId, status: update.status }, occurredAt: new Date().toISOString() });
            }
            await this.idem_complete(tenantId, eventId, 'SYNC_SUPPLIER_STATUS');
            this.logger.info('Supplier status synced successfully', { tenantId, eventId, updatesCount: updates.length });
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to sync supplier status', { tenantId, eventId, error: safeError });
            await this.idem_fail(tenantId, eventId, 'SYNC_SUPPLIER_STATUS');
            await this.audit.append({ tenantId, type: 'SUPPLIER_STATUS_SYNC_FAILED', entityId: eventId, payload: { error: safeError }, occurredAt: new Date().toISOString() });
            throw error;
        }
    }

    public async updatePurchaseOrderLineQuantity(tenantId: string, eventId: string, lineId: string, newQuantity: number) {
        if (!await this.idem_claim(tenantId, eventId, 'UPDATE_PO_LINE_QTY')) {
            this.logger.info('Update line quantity skipped (idempotent)', { tenantId, eventId, lineId });
            return;
        }
        try {
            this.logger.info('Manual update of PO line quantity', { tenantId, eventId, lineId, newQuantity });
            if (this.purchaseOrders.updateLineQuantity) {
                await this.purchaseOrders.updateLineQuantity(tenantId, lineId, newQuantity);
            }
            await this.audit.append({
                tenantId,
                type: 'MANUAL_OVERRIDE_PO_LINE_QUANTITY',
                entityId: lineId,
                payload: { newQuantity, origin: 'MANUAL' },
                occurredAt: new Date().toISOString(),
            });
            await this.idem_complete(tenantId, eventId, 'UPDATE_PO_LINE_QTY');
            this.logger.info('PO line quantity updated successfully', { tenantId, eventId, lineId });
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to update PO line quantity', { tenantId, eventId, lineId, error: safeError });
            await this.idem_fail(tenantId, eventId, 'UPDATE_PO_LINE_QTY');
            throw error;
        }
    }

    public async overridePurchaseOrderSupplier(tenantId: string, eventId: string, orderId: string, newSupplierId: string) {
        if (!await this.idem_claim(tenantId, eventId, 'OVERRIDE_PO_SUPPLIER')) {
            this.logger.info('Override PO supplier skipped (idempotent)', { tenantId, eventId, orderId });
            return;
        }
        try {
            this.logger.info('Manual override of PO supplier', { tenantId, eventId, orderId, newSupplierId });
            if (this.purchaseOrders.overrideSupplier) {
                await this.purchaseOrders.overrideSupplier(tenantId, orderId, newSupplierId);
            }
            await this.audit.append({
                tenantId,
                type: 'MANUAL_OVERRIDE_PO_SUPPLIER',
                entityId: orderId,
                payload: { newSupplierId, origin: 'MANUAL' },
                occurredAt: new Date().toISOString(),
            });
            await this.idem_complete(tenantId, eventId, 'OVERRIDE_PO_SUPPLIER');
            this.logger.info('PO supplier overridden successfully', { tenantId, eventId, orderId });
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to override PO supplier', { tenantId, eventId, orderId, error: safeError });
            await this.idem_fail(tenantId, eventId, 'OVERRIDE_PO_SUPPLIER');
            throw error;
        }
    }

    public async reallocateCustomerOrder(tenantId: string, eventId: string, customerOrderLineId: string, newQuantity: number) {
        if (!await this.idem_claim(tenantId, eventId, 'MANUAL_REALLOCATE')) {
            this.logger.info('Manual reallocate skipped (idempotent)', { tenantId, eventId, customerOrderLineId });
            return;
        }
        try {
            this.logger.info('Manual reallocation of customer order line', { tenantId, eventId, customerOrderLineId, newQuantity });
            if (this.readiness.reallocate) {
                await this.readiness.reallocate(tenantId, customerOrderLineId, newQuantity);
            }
            await this.audit.append({
                tenantId,
                type: 'MANUAL_REALLOCATION',
                entityId: customerOrderLineId,
                payload: { newQuantity, origin: 'MANUAL' },
                occurredAt: new Date().toISOString(),
            });
            await this.idem_complete(tenantId, eventId, 'MANUAL_REALLOCATE');
            this.logger.info('Reallocation completed successfully', { tenantId, eventId, customerOrderLineId });
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to reallocate customer order', { tenantId, eventId, customerOrderLineId, error: safeError });
            await this.idem_fail(tenantId, eventId, 'MANUAL_REALLOCATE');
            throw error;
        }
    }
}
