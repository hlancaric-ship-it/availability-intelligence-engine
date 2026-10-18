import { isPaymentCleared } from '../procurement/PaymentGate.js';
import type { Allocation } from '../procurement/types.js';
import { DEFAULT_FULFILLMENT_POLICY } from './types.js';
import type { FulfillmentBlocker, FulfillmentLine, FulfillmentOrder, FulfillmentPolicy, FulfillmentStatus, ScanResult } from './types.js';

/** Normalizes scanner input: trims, removes inner whitespace, upper-cases. Empty → undefined. */
export function normalizeCode(code: string | undefined | null): string | undefined {
    if (typeof code !== 'string') return undefined;
    const normalized = code.replace(/\s+/g, '').toUpperCase();
    return normalized.length > 0 && normalized.length <= 128 ? normalized : undefined;
}

/**
 * Pure, platform-neutral warehouse logic. Every method returns a NEW order object (inputs are never mutated),
 * so callers can persist with optimistic locking and safely retry.
 */
export class FulfillmentEngine {
    /** How many units of a line belong in the parcel under the given policy. */
    public static targetQuantity(line: FulfillmentLine, policy: FulfillmentPolicy = DEFAULT_FULFILLMENT_POLICY): number {
        return policy.allowPartialShipment ? Math.min(line.orderedQuantity, line.allocatedQuantity) : line.orderedQuantity;
    }

    /** Reasons why the order may not be packed / shipped right now. Empty array = released. */
    public static blockers(order: FulfillmentOrder, policy: FulfillmentPolicy = DEFAULT_FULFILLMENT_POLICY): FulfillmentBlocker[] {
        if (order.status === 'CANCELLED') return ['CANCELLED'];
        if (order.status === 'SHIPPED') return ['ALREADY_SHIPPED'];
        const blockers: FulfillmentBlocker[] = [];
        const complete = order.lines.every((l) => l.allocatedQuantity >= l.orderedQuantity);
        const anything = order.lines.some((l) => Math.min(l.allocatedQuantity, l.orderedQuantity) > 0);
        if (!(complete || (policy.allowPartialShipment && anything))) blockers.push('INCOMPLETE');
        if (!isPaymentCleared(order.paymentInfo, policy.paymentGate)) blockers.push('AWAITING_PAYMENT');
        return blockers;
    }

    /** Derives the status from quantities, payment and policy. Terminal states (SHIPPED, CANCELLED) are kept. */
    public static evaluate(order: FulfillmentOrder, policy: FulfillmentPolicy = DEFAULT_FULFILLMENT_POLICY): FulfillmentOrder {
        if (order.status === 'SHIPPED' || order.status === 'CANCELLED') return order;
        const blockers = this.blockers(order, policy);
        let status: FulfillmentStatus;
        if (blockers.includes('INCOMPLETE')) status = 'WAITING_FOR_STOCK';
        else if (blockers.includes('AWAITING_PAYMENT')) status = 'AWAITING_PAYMENT';
        else {
            const packedAny = order.lines.some((l) => l.packedQuantity > 0);
            const packedAll = order.lines.every((l) => l.packedQuantity >= this.targetQuantity(l, policy));
            status = packedAll && packedAny ? 'PACKED' : packedAny ? 'PACKING' : 'READY_TO_PACK';
        }
        return status === order.status ? order : { ...order, status };
    }

    /**
     * Adds received units to the matching lines (never above the ordered quantity) and re-evaluates.
     * Allocations for lines that are not part of this order are ignored.
     */
    public static applyAllocations(order: FulfillmentOrder, allocations: readonly Allocation[], policy: FulfillmentPolicy = DEFAULT_FULFILLMENT_POLICY): FulfillmentOrder {
        if (order.status === 'SHIPPED' || order.status === 'CANCELLED') return order;
        const byLine = new Map<string, number>();
        for (const a of allocations) {
            if (!Number.isInteger(a.allocatedQuantity) || a.allocatedQuantity <= 0) throw new Error(`Invalid allocation for ${a.customerOrderLineId}`);
            byLine.set(a.customerOrderLineId, (byLine.get(a.customerOrderLineId) ?? 0) + a.allocatedQuantity);
        }
        const lines = order.lines.map((l) => {
            const add = byLine.get(l.customerOrderLineId);
            return add ? { ...l, allocatedQuantity: Math.min(l.orderedQuantity, l.allocatedQuantity + add) } : l;
        });
        return this.evaluate({ ...order, lines }, policy);
    }

    /**
     * Sets the OWN-stock reservation of each line to the planned absolute value and re-evaluates.
     * allocated = (units received from suppliers) + (own stock reservation), capped at the ordered quantity.
     * Once packing has started (or the order is shipped / cancelled) reservations are frozen – a parcel on the
     * packing table is never re-locked by a later planning run.
     */
    public static applyOwnStock(order: FulfillmentOrder, reservations: ReadonlyMap<string, number>, policy: FulfillmentPolicy = DEFAULT_FULFILLMENT_POLICY): FulfillmentOrder {
        if (FROZEN_FOR_RESERVATION.has(order.status)) return order;
        let changed = false;
        const lines = order.lines.map((l) => {
            const planned = reservations.get(l.customerOrderLineId);
            if (planned === undefined) return l;
            if (!Number.isInteger(planned) || planned < 0) throw new Error(`Invalid own-stock reservation for ${l.customerOrderLineId}`);
            const previous = l.ownStockAllocated ?? 0;
            const next = Math.min(planned, l.orderedQuantity);
            if (next === previous) return l;
            changed = true;
            const fromSuppliers = Math.max(0, l.allocatedQuantity - previous);
            return { ...l, ownStockAllocated: next, allocatedQuantity: Math.min(l.orderedQuantity, fromSuppliers + next) };
        });
        return changed ? this.evaluate({ ...order, lines }, policy) : order;
    }

    /** Replaces payment information (fresh from the platform) and re-evaluates. */
    public static withPayment(order: FulfillmentOrder, paymentInfo: FulfillmentOrder['paymentInfo'], policy: FulfillmentPolicy = DEFAULT_FULFILLMENT_POLICY): FulfillmentOrder {
        return this.evaluate({ ...order, paymentInfo }, policy);
    }

    /**
     * Packing scan of ONE unit. Matches EAN or SKU of the order lines.
     * Wrong product / over-quantity / locked order are reported and do not change the order.
     */
    public static scanForPacking(order: FulfillmentOrder, rawCode: string, policy: FulfillmentPolicy = DEFAULT_FULFILLMENT_POLICY): { order: FulfillmentOrder; result: ScanResult } {
        const code = normalizeCode(rawCode);
        if (!code) return { order, result: { ok: false, error: 'INVALID_CODE', code: String(rawCode ?? '') } };
        const evaluated = this.evaluate(order, policy);
        const blockers = this.blockers(evaluated, policy);
        if (blockers.length > 0) return { order: evaluated, result: { ok: false, error: 'NOT_RELEASED', code, blockers } };

        const matching = evaluated.lines.filter((l) => normalizeCode(l.ean) === code || normalizeCode(l.sku) === code);
        if (matching.length === 0) return { order: evaluated, result: { ok: false, error: 'WRONG_PRODUCT', code } };
        const line = matching.find((l) => l.packedQuantity < this.targetQuantity(l, policy));
        if (!line) return { order: evaluated, result: { ok: false, error: 'OVER_QUANTITY', code } };

        const lines = evaluated.lines.map((l) => (l === line ? { ...l, packedQuantity: l.packedQuantity + 1 } : l));
        const next = this.evaluate({ ...evaluated, lines }, policy);
        const updated = next.lines.find((l) => l.customerOrderLineId === line.customerOrderLineId)!;
        return {
            order: next,
            result: { ok: true, customerOrderLineId: updated.customerOrderLineId, sku: updated.sku, packedQuantity: updated.packedQuantity, targetQuantity: this.targetQuantity(updated, policy), orderPacked: next.status === 'PACKED' },
        };
    }

    /** Clears packing progress (e.g. parcel re-opened). Not allowed after shipping. */
    public static resetPacking(order: FulfillmentOrder, policy: FulfillmentPolicy = DEFAULT_FULFILLMENT_POLICY): FulfillmentOrder {
        if (order.status === 'SHIPPED' || order.status === 'CANCELLED') throw new Error(`Order ${order.orderId} is ${order.status}`);
        return this.evaluate({ ...order, lines: order.lines.map((l) => ({ ...l, packedQuantity: 0 })) }, policy);
    }

    /** Marks a fully packed, released order as shipped. */
    public static ship(order: FulfillmentOrder, shippedAt: string, policy: FulfillmentPolicy = DEFAULT_FULFILLMENT_POLICY, tracking?: { trackingNumber?: string | undefined; carrier?: string | undefined }): FulfillmentOrder {
        const evaluated = this.evaluate(order, policy);
        const blockers = this.blockers(evaluated, policy);
        if (blockers.length > 0) throw new FulfillmentLockedError(order.orderId, blockers);
        if (evaluated.status !== 'PACKED') throw new Error(`Order ${order.orderId} is not packed (status ${evaluated.status})`);
        return { ...evaluated, status: 'SHIPPED', shippedAt, trackingNumber: tracking?.trackingNumber, carrier: tracking?.carrier };
    }

    public static cancel(order: FulfillmentOrder): FulfillmentOrder {
        if (order.status === 'SHIPPED') throw new Error(`Order ${order.orderId} is already shipped`);
        return order.status === 'CANCELLED' ? order : { ...order, status: 'CANCELLED' };
    }
}

const FROZEN_FOR_RESERVATION: ReadonlySet<FulfillmentStatus> = new Set(['PACKING', 'PACKED', 'SHIPPED', 'CANCELLED']);

export class FulfillmentLockedError extends Error {
    public constructor(public readonly orderId: string, public readonly blockers: FulfillmentBlocker[]) {
        super(`Order ${orderId} is locked: ${blockers.join(', ')}`);
        this.name = 'FulfillmentLockedError';
    }
}
