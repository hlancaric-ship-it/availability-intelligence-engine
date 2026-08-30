import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DashboardHttpHandler } from '../src/platform/operations/DashboardEndpoint.js';
import type { DashboardReaderPort, DashboardData, CustomerOrderDetail } from '../src/platform/operations/DashboardEndpoint.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const frontendDir = join(__dirname, '..', 'frontend');

class MockDashboardReader implements DashboardReaderPort {
    private readonly orders: CustomerOrderDetail[] = [
        {
            orderId: 'OBJ-2026-001245',
            customerName: 'Jan Novák (cistytriko.cz)',
            status: 'READY_TO_FULFILL',
            items: [
                { sku: 'TRIKO-BASIC-BLK-M', productName: 'Čistý triko Basic Černé (velikost M)', required: 2, stock: 0, incoming: 2, allocated: 2 },
                { sku: 'TRIKO-HEAVY-WHT-L', productName: 'Čistý triko Heavy Bílé (velikost L)', required: 1, stock: 1, incoming: 0, allocated: 1 },
            ],
            procurement: [
                { poId: 'OBJ-DOD-2026-08-001', supplier: 'Fox Outdoor', quantity: 2, eta: '29. srpna (zítra)', status: 'Doručeno a kompletně naskladněno' },
            ],
            allocations: [
                { lineId: 'col-1245-1', allocatedQuantity: 2, fulfilled: true },
                { lineId: 'col-1245-2', allocatedQuantity: 1, fulfilled: true },
            ],
            auditTrail: [
                { time: '11:15:02', actor: 'SYSTEM', action: 'Stav v e-shopu Shoptet byl automaticky aktualizován na „Připraveno k expedici“' },
                { time: '11:15:01', actor: 'SYSTEM', action: 'Objednávka je kompletní a připravena k zabalení a odeslání zákazníkovi' },
                { time: '11:15:00', actor: 'SYSTEM', action: 'Zboží přijato na sklad a automaticky přiřazeno k zákaznické objednávce' },
                { time: '10:31:07', actor: 'SYSTEM', action: 'Vytvořena a odeslána objednávka u dodavatele OBJ-DOD-2026-08-001' },
                { time: '10:31:06', actor: 'SYSTEM', action: 'Výběr dodavatele: Fox Outdoor (nejlepší cena 180 Kč, dodání do 2 dnů)' },
                { time: '10:31:05', actor: 'SYSTEM', action: 'Automatická kontrola skladu: Chybí 2 ks Triko Basic M' },
            ],
        },
        {
            orderId: 'OBJ-2026-001246',
            customerName: 'Petra Dvořáková (ZP Florence)',
            status: 'WAITING_FOR_STOCK',
            items: [
                { sku: 'MED-BANDAGE-10CM', productName: 'Elastické obinadlo 10cm', required: 10, stock: 2, incoming: 8, allocated: 2 },
            ],
            procurement: [
                { poId: 'OBJ-DOD-2026-08-002', supplier: 'Helikon-Tex', quantity: 8, eta: '30. srpna', status: 'Čeká na schválení odeslání' },
            ],
            allocations: [
                { lineId: 'col-1246-1', allocatedQuantity: 2, fulfilled: false },
            ],
            auditTrail: [
                { time: '12:00:02', actor: 'SYSTEM', action: 'Objednávka čeká na vaše potvrzení, aby mohla být odeslána dodavateli.' },
                { time: '12:00:01', actor: 'SYSTEM', action: 'Systém našel dodavatele Helikon-Tex a připravil objednávku na 8 ks.' },
                { time: '12:00:00', actor: 'SYSTEM', action: 'Zákazník objednal 10 ks. Na skladě máme pouze 2 ks (chybí 8 ks).' },
            ],
        },
        {
            orderId: 'OBJ-2026-001247',
            customerName: 'Karel Vlček (cistytriko.cz)',
            status: 'READY_TO_SHIP',
            items: [
                { sku: 'BATOH-35L-OLV', productName: 'Taktický batoh 35L Olive Green', required: 1, stock: 0, incoming: 1, allocated: 1 },
            ],
            procurement: [
                { poId: 'OBJ-DOD-2026-08-003', supplier: 'Brandit CZ', quantity: 1, eta: '28. srpna', status: 'Doručeno na centrální sklad' },
            ],
            allocations: [
                { lineId: 'col-1247-1', allocatedQuantity: 1, fulfilled: true },
            ],
            auditTrail: [
                { time: '14:20:00', actor: 'SYSTEM', action: 'Zboží doručeno a spárováno. Balík je připraven k zabalení.' },
                { time: '09:10:00', actor: 'SYSTEM', action: 'Automaticky objednáno u dodavatele Brandit CZ.' },
            ],
        },
        {
            orderId: 'OBJ-2026-001248',
            customerName: 'Martina Malá (ZP Florence)',
            status: 'READY_TO_SHIP',
            items: [
                { sku: 'SOCK-TERMO-L', productName: 'Termo ponožky merino (velikost L)', required: 6, stock: 6, incoming: 0, allocated: 6 },
            ],
            procurement: [],
            allocations: [
                { lineId: 'col-1248-1', allocatedQuantity: 6, fulfilled: true },
            ],
            auditTrail: [
                { time: '15:00:00', actor: 'SYSTEM', action: 'Veškeré položky byly 100% skladem. Objednávka byla okamžitě připravena k expedici.' },
            ],
        },
    ];

    public async getDashboardData(tenantId: string): Promise<DashboardData> {
        return {
            pending: [
                {
                    id: 'OBJ-DOD-2026-08-001',
                    detail: 'Dodavatel Fox Outdoor &middot; 4 položky (chybí celkem 12 ks pro 3 zákaznické objednávky)',
                    state: 'PENDING_APPROVAL',
                },
                {
                    id: 'OBJ-DOD-2026-08-002',
                    detail: 'Dodavatel Helikon-Tex &middot; 2 položky (chybí 5 ks pro objednávku p. Dvořákové)',
                    state: 'PENDING_APPROVAL',
                },
                {
                    id: 'OBJ-DOD-2026-08-003',
                    detail: 'Dodavatel Brandit &middot; 1 položka (doplnění chybějících 2 ks bundy)',
                    state: 'PENDING_APPROVAL',
                },
            ],
            exceptions: [
                {
                    id: 'VÝJIMKA-001',
                    detail: 'Žádný dodavatel nemá skladem: Taktická obuv vel. 43 (zákazník čeká na 2 ks, dodavatelé hlásí vyprodáno)',
                    state: 'EXCEPTION',
                    exception: true,
                },
                {
                    id: 'VÝJIMKA-002',
                    detail: 'Neshoda při příjmu: Balík od Fox Outdoor obsahoval o 1 ks méně, než bylo fakturováno',
                    state: 'EXCEPTION',
                    exception: true,
                },
            ],
            ready: [
                {
                    id: 'OBJ-2026-001245',
                    detail: 'Jan Novák &middot; 2 položky (všechny 3 ks jsou na skladě a přiřazeny &rarr; lze zabalit a expedovat)',
                    state: 'READY_TO_FULFILL',
                },
                {
                    id: 'OBJ-2026-001247',
                    detail: 'Karel Vlček &middot; Batoh 35L Olive (zboží přijato od dodavatele a přiřazeno)',
                    state: 'READY_TO_SHIP',
                },
                {
                    id: 'OBJ-2026-001248',
                    detail: 'Martina Malá &middot; Termo ponožky L (6 ks kompletně připraveno k zabalení)',
                    state: 'READY_TO_SHIP',
                },
            ],
            orders: this.orders,
        };
    }

    public async getOrderDetail(tenantId: string, orderId: string): Promise<CustomerOrderDetail | undefined> {
        return this.orders.find((o) => o.orderId === orderId) ?? this.orders[0];
    }
}

const dashboardHandler = new DashboardHttpHandler(new MockDashboardReader(), 'local-preview');

const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname.startsWith('/internal/procurement/')) {
        await dashboardHandler.handleRequest(req, res);
        return;
    }

    if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'HEALTHY', mode: 'LOCAL_DEV_MOCK' }));
        return;
    }

    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const fullPath = join(frontendDir, filePath);
    const ext = extname(fullPath);

    try {
        const content = await readFile(fullPath);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] ?? 'text/plain' });
        res.end(content);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

const PORT = 3000;
server.listen(PORT, '127.0.0.1', () => {
    console.log(`Local UI Server running at http://127.0.0.1:${PORT}`);
});

