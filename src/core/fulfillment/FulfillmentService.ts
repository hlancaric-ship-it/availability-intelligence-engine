import type { AuditPort, FulfillmentReadinessPort, LoggerPort } from '../procurement/ports.js';
import type { Allocation, PaymentInfo } from '../procurement/types.js';
import { FulfillmentEngine, FulfillmentLockedError } from './FulfillmentEngine.js';
import { DEFAULT_FULFILLMENT_POLICY } from './types.js';
import type { FulfillmentOrder, FulfillmentPolicy, ScanResult } from './types.js';

export interface FulfillmentRepositoryPort {
    get(tenantId: string, orderId: string): Promise<FulfillmentOrder | undefined>;
    /** Orders containing any of the given customer order lines. */
    findByCustomerLineIds(tenantId: string, customerOrderLineIds: string[]): Promise<FulfillmentOrder[]>;
    listByStatus(tenantId: string, statuses: FulfillmentOrder['status'][], limit: number): Promise<FulfillmentOrder[]>;
    /**
     * Insert (version 0 → 1) or update with optimistic locking: must fail with ConcurrentModificationError when
     * the stored version differs from `order.version`. Persists `order.version + 1`. Rows MUST carry tenant_id.
     */
    save(tenantId: string, order: FulfillmentOrder): Promise<FulfillmentOrder>;
}

/** Fresh payment state from the commerce platform (Shoptet, …) – asked at release time, never cached. */
export interface PaymentStatusPort {
    getPaymentInfo(tenantId: string, orderId: string): Promise<PaymentInfo | undefined>;
}

export class ConcurrentModificationError extends Error {
    public constructor(orderId: string) {
        super(`Order ${orderId} was modified concurrently`);
        this.name = 'ConcurrentModificationError';
    }
}

export type BulkResult = { id: string; ok: true } | { id: string; ok: false; error: string };

/** Runs an action for each id independently; one failure never stops the others. */
export async function runBulk(ids: readonly string[], action: (id: string) => Promise<unknown>, maxItems = 500): Promise<BulkResult[]> {
    if (ids.length > maxItems) throw new Error(`Bulk action limited to ${maxItems} items`);
    const results: BulkResult[] = [];
    for (const id of [...new Set(ids)]) {
        try {
            await action(id);
            results.push({ id, ok: true });
        } catch (error) {
            results.push({ id, ok: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    }
    return results;
}

/**
 * Warehouse application service: receiving allocations, safety lock, scanner packing, shipping, bulk actions.
 * Platform-neutral; the platform is reached only through PaymentStatusPort (and, later, an outbound sync port).
 */
export class FulfillmentService implements FulfillmentReadinessPort {
    public constructor(
        private readonly repository: FulfillmentRepositoryPort,
        private readonly payments: PaymentStatusPort,
        private readonly audit: AuditPort,
        private readonly logger: LoggerPort,
        private readonly policyFor: (tenantId: string) => FulfillmentPolicy | Promise<FulfillmentPolicy> = () => DEFAULT_FULFILLMENT_POLICY,
        private readonly now: () => string = () => new Date().toISOString(),
    ) {}

    /** Creates or refreshes an order coming from the platform (lines, quantities, own-stock allocation, payment). */
    public async upsertOrder(tenantId: string, incoming: Omit<FulfillmentOrder, 'status' | 'version'>): Promise<FulfillmentOrder> {
        validateIncoming(incoming);
        const policy = await this.policyFor(tenantId);
        const existing = await this.repository.get(tenantId, incoming.orderId);
        if (existing && (existing.status === 'SHIPPED' || existing.status === 'CANCELLED')) return existing;
        const lines = incoming.lines.map((l) => {
            const prev = existing?.lines.find((p) => p.customerOrderLineId === l.customerOrderLineId);
            return {
                ...l,
                allocatedQuantity: Math.min(l.orderedQuantity, Math.max(l.allocatedQuantity, prev?.allocatedQuantity ?? 0)),
                packedQuantity: Math.min(prev?.packedQuantity ?? 0, l.orderedQuantity),
            };
        });
        const order = FulfillmentEngine.evaluate({ ...incoming, lines, status: existing?.status ?? 'WAITING_FOR_STOCK', version: existing?.version ?? 0 }, policy);
        return this.repository.save(tenantId, order);
    }

    /** FulfillmentReadinessPort: called by ProcurementWorkflow.receive after goods receipt. */
    public async markReadyToShip(tenantId: string, allocations: Allocation[]): Promise<void> {
        if (allocations.length === 0) return;
        const policy = await this.policyFor(tenantId);
        const orders = await this.repository.findByCustomerLineIds(tenantId, allocations.map((a) => a.customerOrderLineId));
        const known = new Set(orders.flatMap((o) => o.lines.map((l) => l.customerOrderLineId)));
        const unknown = allocations.filter((a) => !known.has(a.customerOrderLineId)).map((a) => a.customerOrderLineId);
        if (unknown.length > 0) {
            this.logger.warn('Allocations for unknown customer order lines', { tenantId, unknown });
            await this.audit.append({ tenantId, type: 'FULFILLMENT_UNKNOWN_ALLOCATION', entityId: unknown[0]!, payload: { customerOrderLineIds: unknown }, occurredAt: this.now() });
        }
        for (const order of orders) {
            const updated = FulfillmentEngine.applyAllocations(order, allocations, policy);
            if (updated === order) continue;
            await this.repository.save(tenantId, updated);
            await this.audit.append({ tenantId, type: 'FULFILLMENT_ALLOCATED', entityId: order.orderId, payload: { status: updated.status }, occurredAt: this.now() });
        }
    }

    /** Re-checks payment with the platform. Called before packing starts and before shipping. */
    public async refreshPayment(tenantId: string, orderId: string): Promise<FulfillmentOrder> {
        const policy = await this.policyFor(tenantId);
        const order = await this.require(tenantId, orderId);
        if (order.status === 'SHIPPED' || order.status === 'CANCELLED') return order;
        const fresh = await this.payments.getPaymentInfo(tenantId, orderId);
        const updated = FulfillmentEngine.withPayment(order, fresh, policy);
        if (updated === order && sameJson(order.paymentInfo, fresh)) return order;
        return this.repository.save(tenantId, updated);
    }

    /** Scanner packing: one scan = one unit. Payment is re-checked from the platform at the first scan. */
    public async scanForPacking(tenantId: string, orderId: string, code: string): Promise<ScanResult> {
        const policy = await this.policyFor(tenantId);
        let order = await this.require(tenantId, orderId);
        if (order.lines.every((l) => l.packedQuantity === 0)) order = await this.refreshPayment(tenantId, orderId);
        const { order: next, result } = FulfillmentEngine.scanForPacking(order, code, policy);
        if (next !== order) await this.repository.save(tenantId, next);
        if (!result.ok) {
            await this.audit.append({ tenantId, type: 'PACKING_SCAN_REJECTED', entityId: orderId, payload: { error: result.error, code: result.code, blockers: result.blockers }, occurredAt: this.now() });
        } else if (result.orderPacked) {
            await this.audit.append({ tenantId, type: 'ORDER_PACKED', entityId: orderId, payload: {}, occurredAt: this.now() });
        }
        return result;
    }

    public async resetPacking(tenantId: string, orderId: string): Promise<FulfillmentOrder> {
        const policy = await this.policyFor(tenantId);
        const saved = await this.repository.save(tenantId, FulfillmentEngine.resetPacking(await this.require(tenantId, orderId), policy));
        await this.audit.append({ tenantId, type: 'PACKING_RESET', entityId: orderId, payload: {}, occurredAt: this.now() });
        return saved;
    }

    /** Ships a packed order. Payment is verified with the platform once more right before. */
    public async ship(tenantId: string, orderId: string, tracking?: { trackingNumber?: string | undefined; carrier?: string | undefined }): Promise<FulfillmentOrder> {
        const policy = await this.policyFor(tenantId);
        const order = await this.refreshPayment(tenantId, orderId);
        if (order.status === 'SHIPPED') return order; // idempotent
        try {
            const shipped = await this.repository.save(tenantId, FulfillmentEngine.ship(order, this.now(), policy, tracking));
            await this.audit.append({ tenantId, type: 'ORDER_SHIPPED', entityId: orderId, payload: { carrier: tracking?.carrier, trackingNumber: tracking?.trackingNumber }, occurredAt: this.now() });
            return shipped;
        } catch (error) {
            if (error instanceof FulfillmentLockedError) {
                await this.audit.append({ tenantId, type: 'SHIPPING_BLOCKED', entityId: orderId, payload: { blockers: error.blockers }, occurredAt: this.now() });
            }
            throw error;
        }
    }

    public async cancel(tenantId: string, orderId: string): Promise<FulfillmentOrder> {
        const saved = await this.repository.save(tenantId, FulfillmentEngine.cancel(await this.require(tenantId, orderId)));
        await this.audit.append({ tenantId, type: 'FULFILLMENT_CANCELLED', entityId: orderId, payload: {}, occurredAt: this.now() });
        return saved;
    }

    /** Bulk: mark many packed orders as shipped. Each order is checked separately (lock, payment). */
    public shipMany(tenantId: string, orderIds: readonly string[], trackingByOrder: Readonly<Record<string, { trackingNumber?: string | undefined; carrier?: string | undefined }>> = {}): Promise<BulkResult[]> {
        return runBulk(orderIds, (id) => this.ship(tenantId, id, trackingByOrder[id]));
    }

    /** Orders that may be packed now (safety lock open), for the "Co můžete ihned zabalit" column. */
    public async listReadyToPack(tenantId: string, limit = 100): Promise<FulfillmentOrder[]> {
        return this.repository.listByStatus(tenantId, ['READY_TO_PACK', 'PACKING', 'PACKED'], Math.min(Math.max(1, limit), 500));
    }

    private async require(tenantId: string, orderId: string): Promise<FulfillmentOrder> {
        const order = await this.repository.get(tenantId, orderId);
        if (!order) throw new Error(`Order ${orderId} not found`);
        return order;
    }
}

function sameJson(a: unknown, b: unknown): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function validateIncoming(order: Omit<FulfillmentOrder, 'status' | 'version'>): void {
    if (!order.orderId) throw new Error('orderId is required');
    if (order.lines.length === 0) throw new Error(`Order ${order.orderId} has no lines`);
    const ids = new Set<string>();
    for (const l of order.lines) {
        if (!l.customerOrderLineId || ids.has(l.customerOrderLineId)) throw new Error(`Order ${order.orderId}: missing or duplicate line id`);
        ids.add(l.customerOrderLineId);
        if (!Number.isInteger(l.orderedQuantity) || l.orderedQuantity <= 0) throw new Error(`Line ${l.customerOrderLineId}: orderedQuantity must be a positive integer`);
        if (!Number.isInteger(l.allocatedQuantity) || l.allocatedQuantity < 0) throw new Error(`Line ${l.customerOrderLineId}: allocatedQuantity must be a non-negative integer`);
    }
}
