import { ConcurrentModificationError } from '../../core/fulfillment/FulfillmentService.js';
import type { FulfillmentRepositoryPort } from '../../core/fulfillment/FulfillmentService.js';
import type { FulfillmentOrder, FulfillmentStatus } from '../../core/fulfillment/types.js';
import type { PaymentMethod, PaymentStatus } from '../../core/procurement/types.js';
import type { SqlTransaction, TransactionalSql } from './PostgresProcurementRepository.js';

interface OrderRow {
    order_id: string; status: FulfillmentStatus; payment_status: PaymentStatus | null; payment_method: PaymentMethod | null;
    carrier: string | null; tracking_number: string | null; shipped_at: string | Date | null; version: number | string;
}
interface LineRow {
    order_id: string; customer_order_line_id: string; product_id: string; variant_id: string; sku: string; ean: string | null;
    ordered_quantity: number | string; allocated_quantity: number | string; packed_quantity: number | string; own_stock_allocated: number | string | null;
}

/** PostgreSQL implementation of FulfillmentRepositoryPort (migration 005). Every query is filtered by tenant_id. */
export class PostgresFulfillmentRepository implements FulfillmentRepositoryPort {
    public constructor(private readonly db: TransactionalSql) {}

    public get(tenantId: string, orderId: string): Promise<FulfillmentOrder | undefined> {
        return this.db.transaction(async (tx) => (await this.load(tx, tenantId, [orderId]))[0]);
    }

    public findByCustomerLineIds(tenantId: string, customerOrderLineIds: string[]): Promise<FulfillmentOrder[]> {
        if (customerOrderLineIds.length === 0) return Promise.resolve([]);
        return this.db.transaction(async (tx) => {
            const ids = await tx.query<{ order_id: string }>(
                'SELECT DISTINCT order_id FROM fulfillment_order_lines WHERE tenant_id = $1 AND customer_order_line_id = ANY($2::text[])',
                [tenantId, customerOrderLineIds],
            );
            return this.load(tx, tenantId, (ids.rows ?? []).map((r) => r.order_id));
        });
    }

    public listByStatus(tenantId: string, statuses: FulfillmentStatus[], limit: number): Promise<FulfillmentOrder[]> {
        return this.db.transaction(async (tx) => {
            const ids = await tx.query<{ order_id: string }>(
                'SELECT order_id FROM fulfillment_orders WHERE tenant_id = $1 AND status = ANY($2::text[]) ORDER BY updated_at ASC LIMIT $3',
                [tenantId, statuses, limit],
            );
            return this.load(tx, tenantId, (ids.rows ?? []).map((r) => r.order_id));
        });
    }

    public save(tenantId: string, order: FulfillmentOrder): Promise<FulfillmentOrder> {
        return this.db.transaction(async (tx) => {
            const nextVersion = order.version + 1;
            const p = order.paymentInfo;
            const values = [tenantId, order.orderId, order.status, p?.paymentStatus ?? null, p?.paymentMethod ?? null, order.carrier ?? null, order.trackingNumber ?? null, order.shippedAt ?? null, nextVersion];
            const res = order.version === 0
                ? await tx.query(
                    `INSERT INTO fulfillment_orders (tenant_id, order_id, status, payment_status, payment_method, carrier, tracking_number, shipped_at, version)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (tenant_id, order_id) DO NOTHING`, values)
                : await tx.query(
                    `UPDATE fulfillment_orders SET status = $3, payment_status = $4, payment_method = $5, carrier = $6, tracking_number = $7,
                     shipped_at = $8, version = $9, updated_at = NOW() WHERE tenant_id = $1 AND order_id = $2 AND version = $10`, [...values, order.version]);
            if ((res.rowCount ?? 0) !== 1) throw new ConcurrentModificationError(order.orderId);
            for (const l of order.lines) {
                const lineRes = await tx.query(
                    `INSERT INTO fulfillment_order_lines (tenant_id, order_id, customer_order_line_id, product_id, variant_id, sku, ean, ordered_quantity, allocated_quantity, packed_quantity, own_stock_allocated)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                     ON CONFLICT (tenant_id, customer_order_line_id) DO UPDATE SET product_id = EXCLUDED.product_id, variant_id = EXCLUDED.variant_id,
                       sku = EXCLUDED.sku, ean = EXCLUDED.ean, ordered_quantity = EXCLUDED.ordered_quantity,
                       allocated_quantity = EXCLUDED.allocated_quantity, packed_quantity = EXCLUDED.packed_quantity,
                       own_stock_allocated = EXCLUDED.own_stock_allocated
                     WHERE fulfillment_order_lines.order_id = EXCLUDED.order_id`,
                    [tenantId, order.orderId, l.customerOrderLineId, l.productId, l.variantId, l.sku, l.ean ?? null, l.orderedQuantity, l.allocatedQuantity, l.packedQuantity, l.ownStockAllocated ?? 0],
                );
                if ((lineRes.rowCount ?? 0) !== 1) throw new Error(`Line ${l.customerOrderLineId} belongs to another order`);
            }
            return { ...order, version: nextVersion };
        });
    }

    private async load(tx: SqlTransaction, tenantId: string, orderIds: string[]): Promise<FulfillmentOrder[]> {
        if (orderIds.length === 0) return [];
        const orders = await tx.query<OrderRow>(
            'SELECT order_id, status, payment_status, payment_method, carrier, tracking_number, shipped_at, version FROM fulfillment_orders WHERE tenant_id = $1 AND order_id = ANY($2::text[])',
            [tenantId, orderIds],
        );
        const lines = await tx.query<LineRow>(
            `SELECT order_id, customer_order_line_id, product_id, variant_id, sku, ean, ordered_quantity, allocated_quantity, packed_quantity, own_stock_allocated
             FROM fulfillment_order_lines WHERE tenant_id = $1 AND order_id = ANY($2::text[]) ORDER BY customer_order_line_id`,
            [tenantId, orderIds],
        );
        const byOrder = new Map<string, FulfillmentOrder>();
        for (const r of orders.rows ?? []) {
            byOrder.set(r.order_id, {
                orderId: r.order_id,
                status: r.status,
                lines: [],
                paymentInfo: r.payment_status && r.payment_method ? { paymentStatus: r.payment_status, paymentMethod: r.payment_method } : undefined,
                carrier: r.carrier ?? undefined,
                trackingNumber: r.tracking_number ?? undefined,
                shippedAt: r.shipped_at ? new Date(r.shipped_at).toISOString() : undefined,
                version: Number(r.version),
            });
        }
        for (const l of lines.rows ?? []) {
            byOrder.get(l.order_id)?.lines.push({
                customerOrderLineId: l.customer_order_line_id, productId: l.product_id, variantId: l.variant_id, sku: l.sku,
                ...(l.ean ? { ean: l.ean } : {}),
                orderedQuantity: Number(l.ordered_quantity), allocatedQuantity: Number(l.allocated_quantity), packedQuantity: Number(l.packed_quantity),
                ownStockAllocated: Number(l.own_stock_allocated ?? 0),
            });
        }
        // Keep the requested order (e.g. oldest first from listByStatus).
        return orderIds.map((id) => byOrder.get(id)).filter((o): o is FulfillmentOrder => o !== undefined);
    }
}
