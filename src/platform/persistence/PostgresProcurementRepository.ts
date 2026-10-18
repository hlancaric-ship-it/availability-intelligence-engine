import type { AuditPort, IdempotencyPort, PurchaseOrderPort } from '../../core/procurement/ports.js';
import type { GoodsReceiptLine, ProcurementPlan, PurchaseOrder } from '../../core/procurement/types.js';

export interface SqlQueryResult<TRow = unknown> { rowCount: number; rows?: TRow[]; }
export interface SqlTransaction { query<TRow = unknown>(sql: string, values?: unknown[]): Promise<SqlQueryResult<TRow>>; }
export interface TransactionalSql { transaction<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T>; }

const TERMINAL_PO_STATUSES = "'CANCELLED','RECEIVED','COMPLETED'";
const EDITABLE_PO_STATUSES = "'DRAFT','PENDING_APPROVAL'";

/** Production repository: callers provide a PostgreSQL transaction adapter (e.g. pg Pool). */
export class PostgresProcurementRepository implements PurchaseOrderPort, IdempotencyPort, AuditPort {
    public constructor(private readonly db: TransactionalSql) {}
    public async savePlan(tenantId: string, plan: ProcurementPlan): Promise<void> { await this.db.transaction(async (tx) => { for (const po of plan.purchaseOrders) { await tx.query('INSERT INTO procurement_purchase_orders (id, tenant_id, supplier_id, status) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING', [po.id, tenantId, po.supplierId, po.status]); for (const line of po.lines) await tx.query('INSERT INTO procurement_purchase_order_lines (id,purchase_order_id,customer_order_line_id,product_id,variant_id,supplier_sku,quantity,received_quantity,unit_price,currency) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING', [line.id, po.id, line.customerOrderLineId, line.productId, line.variantId, line.supplierSku, line.quantity, line.receivedQuantity, line.unitPrice, line.currency]); } }); }
    public async markAsSent(tenantId: string, orderId: string, externalId?: string): Promise<void> { await this.db.transaction((tx) => tx.query("UPDATE procurement_purchase_orders SET status = 'SENT', external_id = COALESCE($3, external_id) WHERE id = $1 AND tenant_id = $2 AND status IN ('DRAFT','PENDING_APPROVAL','SENT')", [orderId, tenantId, externalId ?? null])); }
    public async updateStatusByExternalId(tenantId: string, externalId: string, status: 'ACCEPTED' | 'SHIPPED' | 'CANCELLED', supplierId?: string): Promise<boolean> {
        // Terminal states (cancelled / received) must not be reopened by a late or replayed supplier update.
        const res = await this.db.transaction((tx) => tx.query(`UPDATE procurement_purchase_orders SET status = $1 WHERE tenant_id = $2 AND external_id = $3 AND ($4::text IS NULL OR supplier_id = $4) AND status NOT IN (${TERMINAL_PO_STATUSES})`, [status, tenantId, externalId, supplierId ?? null]));
        return (res.rowCount ?? 0) > 0;
    }
    public async recordReceipt(tenantId: string, receipt: GoodsReceiptLine[]): Promise<void> { for (const row of receipt) if (!Number.isInteger(row.receivedQuantity) || row.receivedQuantity <= 0) throw new Error('receivedQuantity must be a positive integer'); await this.db.transaction(async (tx) => { for (const row of receipt) await tx.query('UPDATE procurement_purchase_order_lines l SET received_quantity = LEAST(l.quantity, l.received_quantity + $1) FROM procurement_purchase_orders po WHERE l.id = $2 AND l.purchase_order_id = $3 AND po.id = l.purchase_order_id AND po.tenant_id = $4', [row.receivedQuantity, row.procurementLineId, row.purchaseOrderId, tenantId]); }); }
    public async getOrdersByIds(tenantId: string, orderIds: string[]): Promise<PurchaseOrder[]> {
        if (orderIds.length === 0) return [];
        const placeholders = orderIds.map((_, i) => `$${i + 2}`).join(',');
        interface RawRow {
            po_id: string;
            supplier_id: string;
            status: string;
            line_id: string | null;
            purchase_order_id: string | null;
            customer_order_line_id: string | null;
            product_id: string | null;
            variant_id: string | null;
            supplier_sku: string | null;
            quantity: string | number | null;
            received_quantity: string | number | null;
            unit_price: string | number | null;
            currency: string | null;
        }
        const result = await this.db.transaction(async (tx) => {
            return tx.query<RawRow>(
                `SELECT po.id AS po_id, po.supplier_id, po.status,
                        l.id AS line_id, l.purchase_order_id, l.customer_order_line_id,
                        l.product_id, l.variant_id, l.supplier_sku,
                        l.quantity, l.received_quantity, l.unit_price, l.currency
                 FROM procurement_purchase_orders po
                 LEFT JOIN procurement_purchase_order_lines l ON l.purchase_order_id = po.id
                 WHERE po.tenant_id = $1 AND po.id IN (${placeholders})`,
                [tenantId, ...orderIds],
            );
        });

        const ordersMap = new Map<string, PurchaseOrder>();
        const rows = result.rows ?? [];
        for (const row of rows) {
            if (!ordersMap.has(row.po_id)) {
                ordersMap.set(row.po_id, {
                    id: row.po_id,
                    supplierId: row.supplier_id,
                    status: row.status as PurchaseOrder['status'],
                    lines: [],
                });
            }
            if (row.line_id) {
                ordersMap.get(row.po_id)!.lines.push({
                    id: row.line_id,
                    supplierId: row.supplier_id,
                    customerOrderLineId: row.customer_order_line_id ?? '',
                    productId: row.product_id ?? '',
                    variantId: row.variant_id ?? '',
                    sku: '',
                    supplierSku: row.supplier_sku ?? '',
                    quantity: Number(row.quantity),
                    receivedQuantity: Number(row.received_quantity),
                    unitPrice: Number(row.unit_price),
                    currency: row.currency ?? '',
                    expectedLeadTimeDays: 0,
                });
            }
        }
        return [...ordersMap.values()];
    }
    public async getOrderedQuantityByCustomerLine(tenantId: string, customerOrderLineIds: string[]): Promise<Map<string, number>> {
        const result = new Map<string, number>();
        if (customerOrderLineIds.length === 0) return result;
        const rows = await this.db.transaction((tx) => tx.query<{ customer_order_line_id: string; ordered: string | number }>(
            `SELECT l.customer_order_line_id, SUM(l.quantity) AS ordered
             FROM procurement_purchase_order_lines l
             JOIN procurement_purchase_orders po ON po.id = l.purchase_order_id
             WHERE po.tenant_id = $1 AND po.status <> 'CANCELLED' AND l.customer_order_line_id = ANY($2::text[])
             GROUP BY l.customer_order_line_id`,
            [tenantId, customerOrderLineIds],
        ));
        for (const row of rows.rows ?? []) result.set(row.customer_order_line_id, Number(row.ordered));
        return result;
    }
    public async cancel(tenantId: string, orderId: string): Promise<void> { await this.db.transaction((tx) => tx.query("UPDATE procurement_purchase_orders SET status = 'CANCELLED' WHERE id = $1 AND tenant_id = $2 AND status NOT IN ('RECEIVED','COMPLETED','CANCELLED')", [orderId, tenantId])); }
    public async approve(tenantId: string, orderId: string): Promise<void> {
        await this.db.transaction(async (tx) => {
            const result = await tx.query("SELECT id FROM procurement_purchase_orders WHERE id = $1 AND tenant_id = $2 AND status = 'PENDING_APPROVAL'", [orderId, tenantId]);
            if (result.rowCount === 0) throw new Error(`PO ${orderId} not found or not in PENDING_APPROVAL state`);
        });
    }
    public async updateStatus(tenantId: string, orderId: string, status: 'ACCEPTED' | 'SHIPPED' | 'CANCELLED'): Promise<void> { await this.db.transaction((tx) => tx.query(`UPDATE procurement_purchase_orders SET status = $1 WHERE id = $2 AND tenant_id = $3 AND status NOT IN (${TERMINAL_PO_STATUSES})`, [status, orderId, tenantId])); }
    public async updateLineQuantity(tenantId: string, lineId: string, newQuantity: number): Promise<void> {
        if (!Number.isInteger(newQuantity) || newQuantity <= 0) throw new Error('Quantity must be a positive integer');
        // Only lines of POs not yet sent to the supplier may be edited; otherwise our data diverges from the real order.
        const res = await this.db.transaction((tx) => tx.query(`UPDATE procurement_purchase_order_lines l SET quantity = $1 FROM procurement_purchase_orders po WHERE l.id = $2 AND po.id = l.purchase_order_id AND po.tenant_id = $3 AND po.status IN (${EDITABLE_PO_STATUSES})`, [newQuantity, lineId, tenantId]));
        if ((res.rowCount ?? 0) === 0) throw new Error(`PO line ${lineId} not found or its purchase order is no longer editable`);
    }
    public async overrideSupplier(tenantId: string, orderId: string, newSupplierId: string): Promise<void> {
        const res = await this.db.transaction((tx) => tx.query(`UPDATE procurement_purchase_orders SET supplier_id = $1 WHERE id = $2 AND tenant_id = $3 AND status IN (${EDITABLE_PO_STATUSES})`, [newSupplierId, orderId, tenantId]));
        if ((res.rowCount ?? 0) === 0) throw new Error(`PO ${orderId} not found or no longer editable (already sent to supplier)`);
    }
    public async claim(key: string, operation: string): Promise<boolean> { return this.db.transaction(async (tx) => (await tx.query("INSERT INTO procurement_idempotency_keys (key, operation, state) VALUES ($1,$2,'PROCESSING') ON CONFLICT (key, operation) DO UPDATE SET state = 'PROCESSING', completed_at = NULL WHERE procurement_idempotency_keys.state = 'FAILED'", [key, operation])).rowCount === 1); }
    public async complete(key: string, operation: string): Promise<void> { await this.db.transaction((tx) => tx.query("UPDATE procurement_idempotency_keys SET state = 'COMPLETED', completed_at = NOW() WHERE key = $1 AND operation = $2", [key, operation])); }
    public async fail(key: string, operation: string): Promise<void> { await this.db.transaction((tx) => tx.query("UPDATE procurement_idempotency_keys SET state = 'FAILED' WHERE key = $1 AND operation = $2", [key, operation])); }
    public async append(event: { tenantId: string; type: string; entityId: string; payload: unknown; occurredAt: string }): Promise<void> { await this.db.transaction((tx) => tx.query('INSERT INTO procurement_audit_log (tenant_id,event_type,entity_id,payload,occurred_at) VALUES ($1,$2,$3,$4::jsonb,$5)', [event.tenantId, event.type, event.entityId, JSON.stringify(event.payload), event.occurredAt])); }
}
