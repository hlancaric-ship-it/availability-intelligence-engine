import { describe, test, expect, vi } from 'vitest';
import { PostgresDashboardReader, DashboardHttpHandler } from '../src/platform/operations/DashboardEndpoint.js';
import type { DashboardReaderPort, DashboardData } from '../src/platform/operations/DashboardEndpoint.js';
import type { SqlTransaction, SqlQueryResult } from '../src/platform/persistence/PostgresProcurementRepository.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

describe('Phase 4 - PostgresDashboardReader', () => {
    test('queries pending POs, audit exceptions, and ready_to_ship allocations', async () => {
        const mockPendingRows = [
            { id: 'po-1', supplier_id: 'sup-A', status: 'PENDING_APPROVAL', lines_count: '3' },
        ];
        const mockExceptionRows = [
            {
                id: '10',
                event_type: 'RECONCILIATION_MISMATCH',
                entity_id: 'po-99',
                payload: { missingIn: 'STORE' },
                occurred_at: '2026-08-28T10:00:00Z',
            },
        ];
        const mockReadyRows = [
            { customer_order_line_id: 'col-1', allocated_quantity: '5', ready_at: '2026-08-28T11:00:00Z' },
        ];

        const queryFn = vi.fn().mockImplementation(async (sql: string) => {
            if (sql.includes('procurement_purchase_orders')) {
                return { rowCount: mockPendingRows.length, rows: mockPendingRows } as SqlQueryResult<unknown>;
            }
            if (sql.includes('procurement_audit_log')) {
                return { rowCount: mockExceptionRows.length, rows: mockExceptionRows } as SqlQueryResult<unknown>;
            }
            if (sql.includes('procurement_ready_to_ship')) {
                return { rowCount: mockReadyRows.length, rows: mockReadyRows } as SqlQueryResult<unknown>;
            }
            return { rowCount: 0, rows: [] } as SqlQueryResult<unknown>;
        });

        const tx: SqlTransaction = { query: queryFn };
        const db = {
            transaction: vi.fn().mockImplementation(async (work: (t: SqlTransaction) => Promise<unknown>) => work(tx)),
        };

        const reader = new PostgresDashboardReader(db);
        const data = await reader.getDashboardData('tenant-42');

        expect(db.transaction).toHaveBeenCalledTimes(1);
        expect(queryFn).toHaveBeenCalledTimes(3);

        expect(data.pending).toEqual([
            { id: 'po-1', detail: 'Dodavatel: sup-A (3 položek)', state: 'PENDING_APPROVAL' },
        ]);
        expect(data.exceptions).toEqual([
            {
                id: 'audit-10',
                detail: 'RECONCILIATION_MISMATCH (po-99): {"missingIn":"STORE"}',
                state: 'EXCEPTION',
                exception: true,
            },
        ]);
        expect(data.ready).toEqual([
            { id: 'col-1', detail: 'Alokováno: 5 ks', state: 'READY_TO_SHIP' },
        ]);
    });
});

describe('Phase 4 - DashboardHttpHandler', () => {
    test('handles GET /internal/procurement/dashboard with 200 JSON', async () => {
        const expectedData: DashboardData = {
            pending: [{ id: 'po-1', detail: 'detail', state: 'PENDING_APPROVAL' }],
            exceptions: [],
            ready: [{ id: 'col-1', detail: 'ready 2 ks', state: 'READY_TO_SHIP' }],
        };

        const mockReader: DashboardReaderPort = {
            getDashboardData: vi.fn().mockResolvedValue(expectedData),
        };

        const handler = new DashboardHttpHandler(mockReader, 'test-tenant');

        const req = {
            url: '/internal/procurement/dashboard?tenantId=custom-tenant',
            method: 'GET',
            headers: { host: 'localhost:3000' },
        } as unknown as IncomingMessage;

        let responseStatus = 0;
        let responseHeaders: Record<string, string> = {};
        let responseBody = '';

        const res = {
            writeHead: vi.fn().mockImplementation((status: number, headers: Record<string, string>) => {
                responseStatus = status;
                responseHeaders = headers;
            }),
            end: vi.fn().mockImplementation((body: string) => {
                responseBody = body;
            }),
        } as unknown as ServerResponse;

        await handler.handleRequest(req, res);

        expect(mockReader.getDashboardData).toHaveBeenCalledWith('custom-tenant');
        expect(responseStatus).toBe(200);
        expect(responseHeaders['Content-Type']).toContain('application/json');
        expect(JSON.parse(responseBody)).toEqual(expectedData);
    });

    test('returns 404 for unknown route', async () => {
        const mockReader: DashboardReaderPort = {
            getDashboardData: vi.fn(),
        };

        const handler = new DashboardHttpHandler(mockReader);

        const req = {
            url: '/unknown-route',
            method: 'GET',
            headers: {},
        } as unknown as IncomingMessage;

        let responseStatus = 0;
        const res = {
            writeHead: vi.fn().mockImplementation((status: number) => {
                responseStatus = status;
            }),
            end: vi.fn(),
        } as unknown as ServerResponse;

        await handler.handleRequest(req, res);

        expect(responseStatus).toBe(404);
        expect(mockReader.getDashboardData).not.toHaveBeenCalled();
    });

    test('returns 500 when reader throws error', async () => {
        const mockReader: DashboardReaderPort = {
            getDashboardData: vi.fn().mockRejectedValue(new Error('DB failure')),
        };

        const handler = new DashboardHttpHandler(mockReader);

        const req = {
            url: '/internal/procurement/dashboard',
            method: 'GET',
            headers: {},
        } as unknown as IncomingMessage;

        let responseStatus = 0;
        let responseBody = '';
        const res = {
            writeHead: vi.fn().mockImplementation((status: number) => {
                responseStatus = status;
            }),
            end: vi.fn().mockImplementation((body: string) => {
                responseBody = body;
            }),
        } as unknown as ServerResponse;

        await handler.handleRequest(req, res);

        expect(responseStatus).toBe(500);
        expect(JSON.parse(responseBody)).toEqual({ error: 'DB failure' });
    });

    test('handles GET /internal/procurement/order-detail with 200 JSON', async () => {
        const mockOrderDetail: CustomerOrderDetail = {
            orderId: 'OBJ-100',
            customerName: 'Test Zakaznik',
            status: 'READY_TO_FULFILL',
            items: [
                { sku: 'SKU-1', productName: 'Triko', required: 2, stock: 0, incoming: 2, allocated: 2 },
            ],
            procurement: [
                { poId: 'PO-1', supplier: 'Dodavatel A', quantity: 2, eta: 'zítra', status: 'Doručeno' },
            ],
            allocations: [
                { lineId: 'line-1', allocatedQuantity: 2, fulfilled: true },
            ],
            auditTrail: [
                { time: '10:00:00', actor: 'SYSTEM', action: 'Objednávka připravena k expedici' },
            ],
        };

        const mockReader: DashboardReaderPort = {
            getDashboardData: vi.fn(),
            getOrderDetail: vi.fn().mockResolvedValue(mockOrderDetail),
        };

        const handler = new DashboardHttpHandler(mockReader, 'test-tenant');

        const req = {
            url: '/internal/procurement/order-detail?orderId=OBJ-100',
            method: 'GET',
            headers: { host: 'localhost:3000' },
        } as unknown as IncomingMessage;

        let responseStatus = 0;
        let responseHeaders: Record<string, string> = {};
        let responseBody = '';

        const res = {
            writeHead: vi.fn().mockImplementation((status: number, headers: Record<string, string>) => {
                responseStatus = status;
                responseHeaders = headers;
            }),
            end: vi.fn().mockImplementation((body: string) => {
                responseBody = body;
            }),
        } as unknown as ServerResponse;

        await handler.handleRequest(req, res);

        expect(mockReader.getOrderDetail).toHaveBeenCalledWith('test-tenant', 'OBJ-100');
        expect(responseStatus).toBe(200);
        expect(responseHeaders['Content-Type']).toContain('application/json');
        expect(JSON.parse(responseBody)).toEqual(mockOrderDetail);
    });

    test('handles GET /internal/procurement/order-detail with missing orderId returning 400', async () => {
        const mockReader: DashboardReaderPort = {
            getDashboardData: vi.fn(),
        };

        const handler = new DashboardHttpHandler(mockReader);

        const req = {
            url: '/internal/procurement/order-detail',
            method: 'GET',
            headers: { host: 'localhost:3000' },
        } as unknown as IncomingMessage;

        let responseStatus = 0;
        let responseBody = '';

        const res = {
            writeHead: vi.fn().mockImplementation((status: number) => {
                responseStatus = status;
            }),
            end: vi.fn().mockImplementation((body: string) => {
                responseBody = body;
            }),
        } as unknown as ServerResponse;

        await handler.handleRequest(req, res);

        expect(responseStatus).toBe(400);
        expect(JSON.parse(responseBody)).toEqual({ error: 'Missing orderId parameter' });
    });
});
