import { ProcurementEngine } from './ProcurementEngine.js';
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

    public async createPlan(tenantId: string, eventId: string, policy: ProcurementPolicy) {
        if (!await this.idempotency.claim(eventId, 'PROCUREMENT_PLAN')) {
            this.logger.info('Procurement plan run skipped (idempotent)', { tenantId, eventId });
            return undefined;
        }
        try {
            this.logger.info('Starting procurement planning', { tenantId, eventId });
            const plan = ProcurementEngine.plan(await this.platform.fetchUnfulfilledOrderLines(), await this.catalog.fetchOffers(), policy, eventId);
            await this.purchaseOrders.savePlan(tenantId, plan);
            this.logger.info('Procurement plan created', { tenantId, eventId, newOrders: plan.purchaseOrders.length, unfulfilledCount: plan.unfulfilled.length });
            await this.audit.append({ tenantId, type: 'PROCUREMENT_PLAN_CREATED', entityId: eventId, payload: { purchaseOrders: plan.purchaseOrders.length, unfulfilled: plan.unfulfilled }, occurredAt: new Date().toISOString() });
            
            for (const order of plan.purchaseOrders.filter((candidate) => candidate.status === 'DRAFT')) {
                if (!await this.idempotency.claim(order.id, 'DISPATCH_PO')) {
                    this.logger.info('PO dispatch skipped (idempotent)', { tenantId, eventId, orderId: order.id });
                    continue;
                }
                try {
                    this.logger.info('Dispatching PO', { tenantId, eventId, orderId: order.id, supplierId: order.supplierId });
                    const result = await this.supplierDispatch.dispatchPurchaseOrder(order);
                    await this.purchaseOrders.markAsSent(order.id);
                    await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_DISPATCHED', entityId: eventId, payload: { orderId: order.id, externalId: result.externalId }, occurredAt: new Date().toISOString() });
                    await this.idempotency.complete(order.id, 'DISPATCH_PO');
                    this.logger.info('PO dispatched successfully', { tenantId, eventId, orderId: order.id });
                } catch (error) {
                    const safeError = error instanceof Error ? error.message : 'Unknown error';
                    this.logger.error('Failed to dispatch PO', { tenantId, eventId, orderId: order.id, error: safeError });
                    await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_DISPATCH_FAILED', entityId: eventId, payload: { orderId: order.id, error: safeError }, occurredAt: new Date().toISOString() });
                    await this.idempotency.fail(order.id, 'DISPATCH_PO');
                    throw error;
                }
            }
            await this.idempotency.complete(eventId, 'PROCUREMENT_PLAN');
            this.logger.info('Procurement planning completed', { tenantId, eventId });
            return plan;
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Procurement plan failed', { tenantId, eventId, error: safeError });
            await this.idempotency.fail(eventId, 'PROCUREMENT_PLAN');
            await this.audit.append({ tenantId, type: 'PROCUREMENT_PLAN_FAILED', entityId: eventId, payload: { error: safeError }, occurredAt: new Date().toISOString() });
            throw error;
        }
    }

    public async receive(tenantId: string, eventId: string, receipt: GoodsReceiptLine[]) {
        if (!await this.idempotency.claim(eventId, 'GOODS_RECEIPT')) {
            this.logger.info('Goods receipt skipped (idempotent)', { tenantId, eventId });
            return [];
        }
        try {
            this.logger.info('Processing goods receipt', { tenantId, eventId, receiptLines: receipt.length });
            const orderIds = Array.from(new Set(receipt.map((r) => r.purchaseOrderId)));
            const orders = await this.purchaseOrders.getOrdersByIds(tenantId, orderIds);
            const allocations = ProcurementEngine.receive(orders, receipt);
            await this.purchaseOrders.recordReceipt(receipt);
            await this.readiness.markReadyToShip(allocations);
            await this.audit.append({ tenantId, type: 'GOODS_RECEIVED', entityId: eventId, payload: { allocationsCount: allocations.length }, occurredAt: new Date().toISOString() });
            await this.idempotency.complete(eventId, 'GOODS_RECEIPT');
            this.logger.info('Goods receipt completed', { tenantId, eventId, allocationsCreated: allocations.length });
            return allocations;
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Goods receipt failed', { tenantId, eventId, error: safeError });
            await this.idempotency.fail(eventId, 'GOODS_RECEIPT');
            await this.audit.append({ tenantId, type: 'GOODS_RECEIPT_FAILED', entityId: eventId, payload: { error: safeError }, occurredAt: new Date().toISOString() });
            throw error;
        }
    }

    public async cancelPurchaseOrder(tenantId: string, eventId: string, purchaseOrderId: string) {
        if (!await this.idempotency.claim(eventId, 'CANCEL_PO')) {
            this.logger.info('PO cancellation skipped (idempotent)', { tenantId, eventId, purchaseOrderId });
            return;
        }
        try {
            this.logger.info('Cancelling PO', { tenantId, eventId, purchaseOrderId });
            await this.purchaseOrders.cancel(tenantId, purchaseOrderId);
            await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_CANCELLED', entityId: eventId, payload: { purchaseOrderId }, occurredAt: new Date().toISOString() });
            await this.idempotency.complete(eventId, 'CANCEL_PO');
            this.logger.info('PO cancelled successfully', { tenantId, eventId, purchaseOrderId });
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to cancel PO', { tenantId, eventId, purchaseOrderId, error: safeError });
            await this.idempotency.fail(eventId, 'CANCEL_PO');
            await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_CANCELLATION_FAILED', entityId: eventId, payload: { purchaseOrderId, error: safeError }, occurredAt: new Date().toISOString() });
            throw error;
        }
    }

    public async syncSupplierStatus(tenantId: string, eventId: string) {
        if (!await this.idempotency.claim(eventId, 'SYNC_SUPPLIER_STATUS')) {
            this.logger.info('Supplier status sync skipped (idempotent)', { tenantId, eventId });
            return;
        }
        try {
            this.logger.info('Syncing supplier status', { tenantId, eventId });
            const updates = await this.supplierDispatch.fetchStatusUpdates();
            for (const update of updates) {
                await this.purchaseOrders.updateStatus(tenantId, update.externalId, update.status);
                await this.audit.append({ tenantId, type: 'PURCHASE_ORDER_STATUS_UPDATED', entityId: eventId, payload: { purchaseOrderId: update.externalId, status: update.status }, occurredAt: new Date().toISOString() });
            }
            await this.idempotency.complete(eventId, 'SYNC_SUPPLIER_STATUS');
            this.logger.info('Supplier status synced successfully', { tenantId, eventId, updatesCount: updates.length });
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Failed to sync supplier status', { tenantId, eventId, error: safeError });
            await this.idempotency.fail(eventId, 'SYNC_SUPPLIER_STATUS');
            await this.audit.append({ tenantId, type: 'SUPPLIER_STATUS_SYNC_FAILED', entityId: eventId, payload: { error: safeError }, occurredAt: new Date().toISOString() });
            throw error;
        }
    }
}
