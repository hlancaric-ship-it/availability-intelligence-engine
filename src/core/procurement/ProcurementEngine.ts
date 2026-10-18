import { SupplierSelectionEngine } from './SupplierSelectionEngine.js';
import { isPaymentCleared } from './PaymentGate.js';
import type { Allocation, CustomerOrderLine, GoodsReceiptLine, ProcurementPlan, ProcurementPolicy, PurchaseOrder, SupplierOffer } from './types.js';

export class ProcurementEngine {
    /**
     * @param openProcurementByLine quantity already ordered from suppliers (non-cancelled PO lines) per
     *        customerOrderLineId. It is subtracted from the deficit so repeated runs never re-order the same units.
     *
     * Own stock semantics: `ownStockQuantity` is the TOTAL stock of the variant (the same number on every line
     * of that variant). It is shared and consumed in processing order (priority, then oldest first), so the
     * same units are never promised to two customer orders. If lines disagree, the lowest value is used
     * (conservative: may buy more, never less).
     *
     * Payment gate (policy.paymentGate, default PAID or COD): orders not cleared by payment neither reserve own
     * stock nor get purchased. They are reported in `unfulfilled` with reason AWAITING_PAYMENT and are picked up
     * by a later run once paid. Missing payment information counts as not paid.
     */
    public static plan(demands: CustomerOrderLine[], offers: SupplierOffer[], policy: ProcurementPolicy, eventId: string, openProcurementByLine: ReadonlyMap<string, number> = new Map()): ProcurementPlan {
        for (const demand of demands) {
            if (!Number.isInteger(demand.quantity) || demand.quantity < 0) throw new Error(`Invalid demand ${demand.id}: quantity must be a non-negative integer`);
            if (!Number.isInteger(demand.ownStockQuantity) || demand.ownStockQuantity < 0) throw new Error(`Invalid demand ${demand.id}: ownStockQuantity must be a non-negative integer`);
        }
        const reserved = new Map<string, number>();
        const variantKey = (d: CustomerOrderLine) => `${d.productId}\u0000${d.variantId}`;
        const remainingOwnStock = new Map<string, number>();
        for (const demand of demands) {
            const key = variantKey(demand);
            remainingOwnStock.set(key, Math.min(remainingOwnStock.get(key) ?? Infinity, demand.ownStockQuantity));
        }
        const bySupplier = new Map<string, PurchaseOrder>();
        const unfulfilled: ProcurementPlan['unfulfilled'] = [];

        for (const demand of [...demands].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
            const key = variantKey(demand);
            if (!isPaymentCleared(demand.paymentInfo, policy.paymentGate)) {
                const alreadyOrderedUnpaid = Math.max(0, openProcurementByLine.get(demand.id) ?? 0);
                const waiting = Math.max(0, demand.quantity - alreadyOrderedUnpaid);
                if (waiting > 0) {
                    unfulfilled.push({ customerOrderLineId: demand.id, productId: demand.productId, variantId: demand.variantId, sku: demand.sku, quantity: waiting, reason: 'AWAITING_PAYMENT' });
                }
                continue;
            }
            const stockLeft = remainingOwnStock.get(key) ?? 0;
            const fromOwnStock = Math.min(stockLeft, demand.quantity);
            remainingOwnStock.set(key, stockLeft - fromOwnStock);
            const alreadyOrdered = Math.max(0, openProcurementByLine.get(demand.id) ?? 0);
            const deficit = Math.max(0, demand.quantity - fromOwnStock - alreadyOrdered);
            // SupplierSelectionEngine computes deficit as quantity - ownStockQuantity.
            const result = SupplierSelectionEngine.select({ ...demand, ownStockQuantity: demand.quantity - deficit }, offers, policy, reserved);
            // Line IDs are unique per planning run so a follow-up order for a remaining deficit is never dropped by ON CONFLICT.
            for (const line of result.lines ?? []) line.id = `${line.id}@${eventId}`;
            if (result.unfulfilled) unfulfilled.push(result.unfulfilled);
            const lines = result.lines ?? (result.line ? [result.line] : []);
            for (const line of lines) {
                const supplierId = line.supplierId;
                const order = bySupplier.get(supplierId) ?? {
                    id: `po-${supplierId}-${eventId}`,
                    supplierId,
                    status: policy.approvalMode === 'automatic' ? 'DRAFT' : 'PENDING_APPROVAL',
                    lines: [],
                };
                order.lines.push(line);
                bySupplier.set(supplierId, order);
            }
        }
        return { purchaseOrders: [...bySupplier.values()], unfulfilled };
    }

    /** Allocates received units to the original customer lines; never allocates more than received or ordered. */
    public static receive(purchaseOrders: PurchaseOrder[], receipt: GoodsReceiptLine[]): Allocation[] {
        const allocations: Allocation[] = [];
        for (const received of receipt) {
            if (!Number.isInteger(received.receivedQuantity) || received.receivedQuantity <= 0) throw new Error('receivedQuantity must be a positive integer');
            const order = purchaseOrders.find((po) => po.id === received.purchaseOrderId);
            const line = order?.lines.find((candidate) => candidate.id === received.procurementLineId);
            if (!order || !line) throw new Error(`Unknown purchase order line ${received.procurementLineId}`);
            const allocatable = Math.min(received.receivedQuantity, line.quantity - line.receivedQuantity);
            line.receivedQuantity += allocatable;
            if (allocatable > 0) allocations.push({ customerOrderLineId: line.customerOrderLineId, allocatedQuantity: allocatable, fulfilled: line.receivedQuantity === line.quantity });
            order.status = order.lines.every((candidate) => candidate.receivedQuantity === candidate.quantity)
                ? 'RECEIVED'
                : 'PARTIALLY_RECEIVED';
        }
        return allocations;
    }
}
