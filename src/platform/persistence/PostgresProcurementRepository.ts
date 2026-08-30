import type { AuditPort, IdempotencyPort, PurchaseOrderPort } from '../../core/procurement/ports.js';
import type { GoodsReceiptLine, ProcurementPlan, PurchaseOrder } from '../../core/procurement/types.js';

export interface SqlQueryResult<TRow = unknown> { rowCount: number; rows?: TRow[]; }
export interface SqlTransaction { query<TRow = unknown>(sql: string, values?: unknown[]): Promise<SqlQueryResult<TRow>>; }
export interface TransactionalSql { transaction<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T>; }

/** Production repository: callers provide a PostgreSQL transaction adapter (e.g. pg Pool). */
export class PostgresProcurementRepository implements PurchaseOrderPort, IdempotencyPort, AuditPort {
    public constructor(private readonly db: TransactionalSql) {}
    public async savePlan(tenantId: string, plan: ProcurementPlan): Promise<void> { await this.db.transaction(async (tx) => { for (const po of plan.purchaseOrders) { await tx.query('INSERT INTO procurement_purchase_orders (id, tenant_id, supplier_id, status) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING', [po.id, tenantId, po.supplierId, po.status]); for (const line of po.lines) await tx.query('INSERT INTO procurement_purchase_order_lines (id,purchase_order_id,customer_order_line_id,product_id,variant_id,supplier_sku,quantity,received_quantity,unit_price,currency) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING', [line.id, po.id, line.customerOrderLineId, line.productId, line.variantId, line.supplierSku, line.quantity, line.receivedQuantity, line.unitPrice, line.currency]); } }); }
    public async markAsSent(orderId: string): Promise<void> { await this.db.transaction((tx) => tx.query("UPDATE procurement_purchase_orders SET status = 'SENT' WHERE id = $1 AND status IN ('DRAFT','PENDING_APPROVAL','SENT')", [orderId])); }
    public async recordReceipt(receipt: GoodsReceiptLine[]): Promise<void> { await this.db.transaction(async (tx) => { for (const row of receipt) await tx.query('UPDATE procurement_purchase_order_lines SET received_quantity = LEAST(quantity, received_quantity + $1) WHERE id = $2 AND purchase_order_id = $3', [row.receivedQuantity, row.procurementLineId, row.purchaseOrderId]); }); }
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
    public async cancel(tenantId: string, orderId: string): Promise<void> { await this.db.transaction((tx) => tx.query("UPDATE procurement_purchase_orders SET status = 'CANCELLED' WHERE id = $1 AND tenant_id = $2 AND status NOT IN ('RECEIVED','COMPLETED','CANCELLED')", [orderId, tenantId])); }
    public async approve(tenantId: string, orderId: string): Promise<void> {
        await this.db.transaction(async (tx) => {
            const result = await tx.query("SELECT id FROM procurement_purchase_orders WHERE id = $1 AND tenant_id = $2 AND status = 'PENDING_APPROVAL'", [orderId, tenantId]);
            if (result.rowCount === 0) throw new Error(`PO ${orderId} not found or not in PENDING_APPROVAL state`);
        });
    }
    public async updateStatus(tenantId: string, orderId: string, status: 'ACCEPTED' | 'SHIPPED' | 'CANCELLED'): Promise<void> { await this.db.transaction((tx) => tx.query('UPDATE procurement_purchase_orders SET status = $1 WHERE id = $2 AND tenant_id = $3', [status, orderId, tenantId])); }
    public async updateLineQuantity(tenantId: string, lineId: string, newQuantity: number): Promise<void> {
        if (!Number.isInteger(newQuantity) || newQuantity <= 0) throw new Error('Quantity must be a positive integer');
        await this.db.transaction((tx) => tx.query('UPDATE procurement_purchase_order_lines SET quantity = $1 WHERE id = $2', [newQuantity, lineId]));
    }
    public async overrideSupplier(tenantId: string, orderId: string, newSupplierId: string): Promise<void> {
        await this.db.transaction((tx) => tx.query('UPDATE procurement_purchase_orders SET supplier_id = $1 WHERE id = $2 AND tenant_id = $3', [newSupplierId, orderId, tenantId]));
    }
    public async claim(key: string, operation: string): Promise<boolean> { return this.db.transaction(async (tx) => (await tx.query("INSERT INTO procurement_idempotency_keys (key, operation, state) VALUES ($1,$2,'PROCESSING') ON CONFLICT (key, operation) DO NOTHING", [key, operation])).rowCount === 1); }
    public async complete(key: string, operation: string): Promise<void> { await this.db.transaction((tx) => tx.query("UPDATE procurement_idempotency_keys SET state = 'COMPLETED', completed_at = NOW() WHERE key = $1 AND operation = $2", [key, operation])); }
    public async fail(key: string, operation: string): Promise<void> { await this.db.transaction((tx) => tx.query("UPDATE procurement_idempotency_keys SET state = 'FAILED' WHERE key = $1 AND operation = $2", [key, operation])); }
    public async append(event: { tenantId: string; type: string; entityId: string; payload: unknown; occurredAt: string }): Promise<void> { await this.db.transaction((tx) => tx.query('INSERT INTO procurement_audit_log (tenant_id,event_type,entity_id,payload,occurred_at) VALUES ($1,$2,$3,$4::jsonb,$5)', [event.tenantId, event.type, event.entityId, JSON.stringify(event.payload), event.occurredAt])); }
}
