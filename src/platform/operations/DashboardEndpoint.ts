export interface DashboardItem {
    id: string;
    detail: string;
    state: string;
    exception?: boolean;
}

export interface CustomerOrderDetail {
    orderId: string;
    customerName?: string;
    status: 'READY_TO_FULFILL' | 'PARTIALLY_AVAILABLE' | 'WAITING_FOR_STOCK' | 'READY_TO_SHIP';
    items: {
        sku: string;
        productName: string;
        required: number;
        stock: number;
        incoming: number;
        allocated: number;
    }[];
    procurement: {
        poId: string;
        supplier: string;
        quantity: number;
        eta: string;
        status: string;
    }[];
    allocations: {
        lineId: string;
        allocatedQuantity: number;
        fulfilled: boolean;
    }[];
    auditTrail: {
        time: string;
        actor: 'SYSTEM' | 'USER';
        action: string;
        details?: string;
    }[];
}

export interface DashboardData {
    pending: DashboardItem[];
    exceptions: DashboardItem[];
    ready: DashboardItem[];
    orders?: CustomerOrderDetail[];
}

export interface DashboardReaderPort {
    getDashboardData(tenantId: string): Promise<DashboardData>;
    getOrderDetail?(tenantId: string, orderId: string): Promise<CustomerOrderDetail | undefined>;
}

import type { TransactionalSql } from '../persistence/PostgresProcurementRepository.js';

export class PostgresDashboardReader implements DashboardReaderPort {
    public constructor(private readonly db: TransactionalSql) {}

    public async getDashboardData(tenantId: string): Promise<DashboardData> {
        return this.db.transaction(async (tx) => {
            // 1. Pending approval purchase orders
            const pendingQuery = await tx.query<{ id: string; supplier_id: string; status: string; lines_count: string }>(
                `SELECT po.id, po.supplier_id, po.status, COUNT(l.id) AS lines_count
                 FROM procurement_purchase_orders po
                 LEFT JOIN procurement_purchase_order_lines l ON l.purchase_order_id = po.id
                 WHERE po.tenant_id = $1 AND po.status = 'PENDING_APPROVAL'
                 GROUP BY po.id, po.supplier_id, po.status
                 ORDER BY po.created_at ASC`,
                [tenantId],
            );
            const pending: DashboardItem[] = (pendingQuery.rows ?? []).map((row) => ({
                id: row.id,
                detail: `Dodavatel: ${row.supplier_id} (${row.lines_count} položek)`,
                state: row.status,
            }));

            // 2. Exceptions (from audit log failed events and reconciliation mismatches)
            const exceptionsQuery = await tx.query<{ id: string; event_type: string; entity_id: string; payload: unknown; occurred_at: string }>(
                `SELECT id, event_type, entity_id, payload, occurred_at
                 FROM procurement_audit_log
                 WHERE tenant_id = $1 AND (
                     event_type LIKE '%FAILED%' OR 
                     event_type = 'RECONCILIATION_MISMATCH'
                 )
                 ORDER BY occurred_at DESC
                 LIMIT 50`,
                [tenantId],
            );
            const exceptions: DashboardItem[] = (exceptionsQuery.rows ?? []).map((row) => ({
                id: `audit-${row.id}`,
                detail: `${row.event_type} (${row.entity_id}): ${JSON.stringify(row.payload)}`,
                state: 'EXCEPTION',
                exception: true,
            }));

            // 3. Ready to ship allocations / received items
            const readyQuery = await tx.query<{ customer_order_line_id: string; allocated_quantity: string; ready_at: string }>(
                `SELECT customer_order_line_id, allocated_quantity, ready_at
                 FROM procurement_ready_to_ship
                 ORDER BY ready_at DESC
                 LIMIT 50`,
            );
            const ready: DashboardItem[] = (readyQuery.rows ?? []).map((row) => ({
                id: row.customer_order_line_id,
                detail: `Alokováno: ${row.allocated_quantity} ks`,
                state: 'READY_TO_SHIP',
            }));

            return { pending, exceptions, ready };
        });
    }
}

import type { IncomingMessage, ServerResponse } from 'node:http';

export class DashboardHttpHandler {
    public constructor(
        private readonly reader: DashboardReaderPort,
        private readonly defaultTenantId: string = 'default',
    ) {}

    public async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const tenantId = url.searchParams.get('tenantId') ?? (req.headers['x-tenant-id'] as string) ?? this.defaultTenantId;

        // GET /internal/procurement/dashboard
        if (req.method === 'GET' && url.pathname === '/internal/procurement/dashboard') {
            try {
                const data = await this.reader.getDashboardData(tenantId);
                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                });
                res.end(JSON.stringify(data));
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: message }));
            }
            return;
        }

        // GET /internal/procurement/order-detail?orderId=...
        if (req.method === 'GET' && url.pathname === '/internal/procurement/order-detail') {
            const orderId = url.searchParams.get('orderId');
            if (!orderId) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Missing orderId parameter' }));
                return;
            }

            try {
                if (this.reader.getOrderDetail) {
                    const detail = await this.reader.getOrderDetail(tenantId, orderId);
                    if (detail) {
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify(detail));
                        return;
                    }
                }
                res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Order not found' }));
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: message }));
            }
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
}
