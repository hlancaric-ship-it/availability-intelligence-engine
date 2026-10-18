import { describe, expect, test, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DashboardHttpHandler, type DashboardReaderPort } from '../src/platform/operations/DashboardEndpoint.js';
import { NoApiCsvAdapter, csvCell } from '../src/platform/suppliers/NoApiCsvAdapter.js';

function call(handler: DashboardHttpHandler, url: string, headers: Record<string, string> = {}) {
    const out = { status: 0, body: '' };
    const req = { url, method: 'GET', headers: { host: 'x', ...headers } } as unknown as IncomingMessage;
    const res = { writeHead: (s: number) => { out.status = s; }, end: (b: string) => { out.body = b; } } as unknown as ServerResponse;
    return handler.handleRequest(req, res).then(() => out);
}
const reader = (): DashboardReaderPort => ({
    getDashboardData: vi.fn().mockResolvedValue({ pending: [], exceptions: [], ready: [] }),
    getOrderDetail: vi.fn().mockResolvedValue(undefined),
});

describe('Dashboard – autorizace a izolace tenantů', () => {
    test('ignoruje tenantId z query i hlavičky (IDOR)', async () => {
        const r = reader();
        const h = new DashboardHttpHandler(r, 'my-shop');
        await call(h, '/internal/procurement/dashboard?tenantId=victim', { 'x-tenant-id': 'victim' });
        expect(r.getDashboardData).toHaveBeenCalledWith('my-shop');
    });
    test('bez platného přihlášení vrací 401 a nečte data', async () => {
        const r = reader();
        const h = new DashboardHttpHandler(r, 'x', async () => null);
        expect((await call(h, '/internal/procurement/dashboard')).status).toBe(401);
        expect(r.getDashboardData).not.toHaveBeenCalled();
    });
    test('výjimka v autentizaci = 401, ne 500', async () => {
        const h = new DashboardHttpHandler(reader(), 'x', async () => { throw new Error('boom'); });
        expect((await call(h, '/internal/procurement/dashboard')).status).toBe(401);
    });
    test('tenant se bere z ověřené identity', async () => {
        const r = reader();
        const h = new DashboardHttpHandler(r, 'x', async (req) => (req.headers.authorization === 'Bearer ok' ? 'shop-42' : null));
        await call(h, '/internal/procurement/dashboard?tenantId=victim', { authorization: 'Bearer ok' });
        expect(r.getDashboardData).toHaveBeenCalledWith('shop-42');
    });
    test('500 neprozrazuje interní chybu', async () => {
        const r = reader();
        (r.getDashboardData as any).mockRejectedValue(new Error('password authentication failed for user "postgres" at 10.0.0.5'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const out = await call(new DashboardHttpHandler(r), '/internal/procurement/dashboard');
        expect(out.status).toBe(500);
        expect(out.body).not.toContain('postgres');
    });
    test.each(['<script>alert(1)</script>', "1' OR '1'='1", 'a'.repeat(500), '../../etc/passwd'])('odmítne podezřelé orderId %s', async (id) => {
        const r = reader();
        const out = await call(new DashboardHttpHandler(r), `/internal/procurement/order-detail?orderId=${encodeURIComponent(id)}`);
        expect(out.status).toBe(400);
        expect(r.getOrderDetail).not.toHaveBeenCalled();
    });
});

describe('CSV – injection a validace vstupů', () => {
    const a = new NoApiCsvAdapter();
    test.each(['=HYPERLINK("http://evil")', '+1+1', '-2+3', '@SUM(A1)'])('neutralizuje vzorec %s', (v) => {
        expect(csvCell(v).replace(/^"/, '').startsWith("'")).toBe(true);
    });
    test('export PO nevloží vzorec ani nerozbije sloupce', () => {
        const csv = a.exportPurchaseOrder({ lines: [{ supplierSku: '=cmd|calc,x', quantity: 1 }] } as any);
        expect(csv.split('\n')[1]).toBe(`"'=cmd|calc,x",1`);
    });
    test.each([['-5'], ['abc'], ['1.5'], ['']])('odmítne příjemku s množstvím %s', (q) => {
        expect(() => a.importGoodsReceipt(`po,line,qty\nPO1,L1,${q}`)).toThrow();
    });
    test.each([['-1', '10', '2'], ['5', 'NaN', '2'], ['5', '10', '-3']])('odmítne nabídku qty=%s price=%s lead=%s', (q, p, l) => {
        expect(() => a.importSupplierOffers('s', `h\nSKU,P,V,${q},${p},CZK,${l}`)).toThrow();
    });
    test('validní data projdou', () => {
        expect(a.importGoodsReceipt('h\nPO1,L1,3')).toEqual([{ purchaseOrderId: 'PO1', procurementLineId: 'L1', receivedQuantity: 3 }]);
    });
});

import { PostgresProcurementRepository } from '../src/platform/persistence/PostgresProcurementRepository.js';

describe('Repository – každý zápis je omezen na tenanta', () => {
    function fakeDb() {
        const calls: { sql: string; params: unknown[] }[] = [];
        const tx = { query: async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }); return { rows: [{ id: 'x' }], rowCount: 1 }; } };
        return { calls, db: { transaction: async (fn: any) => fn(tx) } as any };
    }
    test.each([
        ['markAsSent', (r: any) => r.markAsSent('tenant-A', 'PO1')],
        ['recordReceipt', (r: any) => r.recordReceipt('tenant-A', [{ purchaseOrderId: 'PO1', procurementLineId: 'L1', receivedQuantity: 1 }])],
        ['updateLineQuantity', (r: any) => r.updateLineQuantity('tenant-A', 'L1', 2)],
        ['overrideSupplier', (r: any) => r.overrideSupplier('tenant-A', 'PO1', 'S2')],
        ['cancel', (r: any) => r.cancel('tenant-A', 'PO1')],
        ['updateStatus', (r: any) => r.updateStatus('tenant-A', 'PO1', 'SHIPPED')],
    ])('%s filtruje podle tenant_id', async (_n, run) => {
        const { calls, db } = fakeDb();
        await run(new PostgresProcurementRepository(db));
        const updates = calls.filter((c) => /^\s*UPDATE/i.test(c.sql));
        expect(updates.length).toBeGreaterThan(0);
        for (const u of updates) {
            expect(u.sql).toMatch(/tenant_id\s*=\s*\$\d/);
            expect(u.params).toContain('tenant-A');
        }
    });
});
