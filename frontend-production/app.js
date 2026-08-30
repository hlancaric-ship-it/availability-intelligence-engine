// ==============================================
// Mock Data — vycházející ze struktur AIE
// ==============================================

const mockData = {
    // CustomerOrderLine
    customerOrders: [
        {
            id: 'line-1',
            orderId: 'ORD-2026-001',
            productId: 'PROD-SHIRT-001',
            variantId: 'BLUE-M',
            sku: 'SHIRT-BLUE-M',
            quantity: 10,
            ownStockQuantity: 3,
            createdAt: '2026-08-31T08:00:00Z',
            priority: 1,
            customerName: 'Obchod Pod Lipou',
            deficit: 7,
        },
        {
            id: 'line-2',
            orderId: 'ORD-2026-002',
            productId: 'PROD-PANTS-001',
            variantId: 'BLACK-L',
            sku: 'PANTS-BLACK-L',
            quantity: 5,
            ownStockQuantity: 5,
            createdAt: '2026-08-31T08:15:00Z',
            priority: 0,
            customerName: 'Fashion Shop CZ',
            deficit: 0,
        },
        {
            id: 'line-3',
            orderId: 'ORD-2026-003',
            productId: 'PROD-HAT-001',
            variantId: 'RED',
            sku: 'HAT-RED',
            quantity: 20,
            ownStockQuantity: 5,
            createdAt: '2026-08-31T09:00:00Z',
            priority: 2,
            customerName: 'Velký maloobchod',
            deficit: 15,
        },
        {
            id: 'line-4',
            orderId: 'ORD-2026-004',
            productId: 'PROD-JACKET-001',
            variantId: 'GREEN-XL',
            sku: 'JACKET-GREEN-XL',
            quantity: 8,
            ownStockQuantity: 0,
            createdAt: '2026-08-31T09:30:00Z',
            priority: 1,
            customerName: 'Sport & Outdoor',
            deficit: 8,
        },
    ],

    // SupplierOffer
    supplierOffers: [
        { supplierId: 'SUP-001', supplierSku: 'FOX-SHIRT-BLU', productId: 'PROD-SHIRT-001', variantId: 'BLUE-M', availableQuantity: 50, unitPrice: 120, currency: 'CZK', leadTimeDays: 2, active: true, supplierPriority: 1 },
        { supplierId: 'SUP-002', supplierSku: 'ABC-SHIRT-BLU', productId: 'PROD-SHIRT-001', variantId: 'BLUE-M', availableQuantity: 30, unitPrice: 125, currency: 'CZK', leadTimeDays: 3, active: true, supplierPriority: 2 },
        { supplierId: 'SUP-001', supplierSku: 'FOX-PANTS-BLK', productId: 'PROD-PANTS-001', variantId: 'BLACK-L', availableQuantity: 100, unitPrice: 180, currency: 'CZK', leadTimeDays: 2, active: true, supplierPriority: 1 },
        { supplierId: 'SUP-003', supplierSku: 'XYZ-HAT-RED', productId: 'PROD-HAT-001', variantId: 'RED', availableQuantity: 200, unitPrice: 45, currency: 'CZK', leadTimeDays: 1, active: true, supplierPriority: 1 },
        { supplierId: 'SUP-002', supplierSku: 'ABC-JACKET-GRN', productId: 'PROD-JACKET-001', variantId: 'GREEN-XL', availableQuantity: 25, unitPrice: 350, currency: 'CZK', leadTimeDays: 4, active: true, supplierPriority: 2 },
    ],

    // PurchaseOrder + PurchaseOrderLine
    purchaseOrders: [
        {
            id: 'PO-2026-0001',
            supplierId: 'SUP-001',
            status: 'PENDING_APPROVAL',
            lines: [
                { id: 'POL-1', customerOrderLineId: 'line-1', productId: 'PROD-SHIRT-001', variantId: 'BLUE-M', sku: 'SHIRT-BLUE-M', supplierSku: 'FOX-SHIRT-BLU', quantity: 7, receivedQuantity: 0, unitPrice: 120, currency: 'CZK', expectedLeadTimeDays: 2 },
            ],
        },
        {
            id: 'PO-2026-0002',
            supplierId: 'SUP-003',
            status: 'PENDING_APPROVAL',
            lines: [
                { id: 'POL-2', customerOrderLineId: 'line-3', productId: 'PROD-HAT-001', variantId: 'RED', sku: 'HAT-RED', supplierSku: 'XYZ-HAT-RED', quantity: 15, receivedQuantity: 0, unitPrice: 45, currency: 'CZK', expectedLeadTimeDays: 1 },
            ],
        },
        {
            id: 'PO-2026-0003',
            supplierId: 'SUP-002',
            status: 'PENDING_APPROVAL',
            lines: [
                { id: 'POL-3', customerOrderLineId: 'line-4', productId: 'PROD-JACKET-001', variantId: 'GREEN-XL', sku: 'JACKET-GREEN-XL', supplierSku: 'ABC-JACKET-GRN', quantity: 8, receivedQuantity: 0, unitPrice: 350, currency: 'CZK', expectedLeadTimeDays: 4 },
            ],
        },
        {
            id: 'PO-2026-0004',
            supplierId: 'SUP-001',
            status: 'SENT',
            lines: [
                { id: 'POL-4', customerOrderLineId: 'line-2', productId: 'PROD-PANTS-001', variantId: 'BLACK-L', sku: 'PANTS-BLACK-L', supplierSku: 'FOX-PANTS-BLK', quantity: 10, receivedQuantity: 0, unitPrice: 180, currency: 'CZK', expectedLeadTimeDays: 2 },
            ],
        },
        {
            id: 'PO-2026-0005',
            supplierId: 'SUP-002',
            status: 'SENT',
            lines: [
                { id: 'POL-5', customerOrderLineId: 'line-1', productId: 'PROD-SHIRT-001', variantId: 'BLUE-M', sku: 'SHIRT-BLUE-M', supplierSku: 'ABC-SHIRT-BLU', quantity: 20, receivedQuantity: 0, unitPrice: 125, currency: 'CZK', expectedLeadTimeDays: 3 },
            ],
        },
        {
            id: 'PO-2026-0006',
            supplierId: 'SUP-003',
            status: 'RECEIVED',
            lines: [
                { id: 'POL-6', customerOrderLineId: 'line-3', productId: 'PROD-HAT-001', variantId: 'RED', sku: 'HAT-RED', supplierSku: 'XYZ-HAT-RED', quantity: 50, receivedQuantity: 50, unitPrice: 45, currency: 'CZK', expectedLeadTimeDays: 1 },
            ],
        },
        {
            id: 'PO-2026-0007',
            supplierId: 'SUP-001',
            status: 'RECEIVED',
            lines: [
                { id: 'POL-7', customerOrderLineId: 'line-1', productId: 'PROD-SHIRT-001', variantId: 'BLUE-M', sku: 'SHIRT-BLUE-M', supplierSku: 'FOX-SHIRT-BLU', quantity: 30, receivedQuantity: 30, unitPrice: 120, currency: 'CZK', expectedLeadTimeDays: 2 },
            ],
        },
    ],

    suppliers: [
        { id: 'SUP-001', name: 'FOX Trading', priority: 1, leadTime: '2 dny', minOrder: '0 Kč', feedType: 'CSV', feedStatus: 'active', lastUpdate: '2026-08-31 10:30' },
        { id: 'SUP-002', name: 'ABC Import', priority: 2, leadTime: '3 dny', minOrder: '500 Kč', feedType: 'API', feedStatus: 'active', lastUpdate: '2026-08-31 10:15' },
        { id: 'SUP-003', name: 'XYZ Distribution', priority: 1, leadTime: '1 den', minOrder: '0 Kč', feedType: 'CSV', feedStatus: 'warning', lastUpdate: '2026-08-30 18:00' },
    ],

    feeds: [
        { id: 'feed-1', supplier: 'FOX Trading', type: 'CSV', url: 's3://buckets/fox-offers.csv', status: 'ok', productsCount: 450, lastSuccess: '2026-08-31 10:30', nextScheduled: '2026-08-31 11:30' },
        { id: 'feed-2', supplier: 'ABC Import', type: 'API', url: 'api.abcimport.cz/v1/catalog', status: 'ok', productsCount: 1200, lastSuccess: '2026-08-31 10:15', nextScheduled: '2026-08-31 10:45' },
        { id: 'feed-3', supplier: 'XYZ Distribution', type: 'CSV', url: 'sftp://xyz.cz/export/weekly.csv', status: 'warning', productsCount: 680, lastSuccess: '2026-08-30 18:00', nextScheduled: '2026-08-31 18:00' },
    ],

    carriers: [
        { id: 'car-1', name: 'ČeskouPošta', service: 'Balík Do Ruky', cost: 'od 50 Kč', delivery: '1-2 dny', tracking: true },
        { id: 'car-2', name: 'GLS', service: 'Express', cost: 'od 100 Kč', delivery: 'NÁSLEDUJÍCÍ DEN', tracking: true },
        { id: 'car-3', name: 'DPD', service: 'Klasik', cost: 'od 80 Kč', delivery: '1-3 dny', tracking: true },
    ],

    auditLog: [
        { id: 'a-1', type: 'PROCUREMENT_PLAN_CREATED', entityId: 'event-20260831-0900', timestamp: '2026-08-31 09:00:00', detail: '3 nákupní objednávky, 2 nespárované položky' },
        { id: 'a-2', type: 'PURCHASE_ORDER_DISPATCHED', entityId: 'PO-2026-0004', timestamp: '2026-08-31 08:45:00', detail: 'Odeslán FOX Trading (10 ks Pants, 1800 Kč)' },
        { id: 'a-3', type: 'GOODS_RECEIVED', entityId: 'PO-2026-0006', timestamp: '2026-08-31 08:30:00', detail: 'Příjem: 50 ks Klobouk Red' },
        { id: 'a-4', type: 'PROCUREMENT_PLAN_CREATED', entityId: 'event-20260830-1800', timestamp: '2026-08-30 18:00:00', detail: '2 nákupní objednávky, automaticky schváleny' },
    ],
};

// ==============================================
// App State
// ==============================================

const state = {
    currentSection: 'overview',
    procurementFilter: 'all',
};

// ==============================================
// Navigation
// ==============================================

document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        switchSection(section);
    });
});

function switchSection(section) {
    // Hide all sections
    document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));

    // Show selected section
    const element = document.getElementById(`sec-${section}`);
    if (element) {
        element.classList.add('active');
    }

    // Highlight nav
    document.querySelector(`[data-section="${section}"]`).classList.add('active');

    // Update header
    const titles = {
        overview: { title: 'Přehled', desc: 'Aktuální stav objednávek a zásob' },
        orders: { title: 'Objednávky', desc: 'Zákaznické objednávky a jejich stav' },
        availability: { title: 'Dostupnost', desc: 'Sklad a dostupnost u dodavatelů' },
        procurement: { title: 'Nákup', desc: 'Nákupní objednávky a jejich plánování' },
        suppliers: { title: 'Dodavatelé', desc: 'Přehled a konfigurace dodavatelů' },
        feeds: { title: 'Feedy', desc: 'Zdroje dat a jejich stav' },
        carriers: { title: 'Dopravci', desc: 'Přepravní služby' },
        rules: { title: 'Pravidla', desc: 'Konfigurace strategií a pravidel' },
        audit: { title: 'Audit', desc: 'Historické záznamy' },
    };

    const title = titles[section] || { title: 'Sekce', desc: '' };
    document.getElementById('section-title').textContent = title.title;
    document.getElementById('section-desc').textContent = title.desc;

    state.currentSection = section;
    renderCurrentSection();
}

// ==============================================
// Rendering
// ==============================================

function renderCurrentSection() {
    switch (state.currentSection) {
        case 'overview':
            renderOverview();
            break;
        case 'orders':
            renderOrders();
            break;
        case 'availability':
            renderAvailability();
            break;
        case 'procurement':
            renderProcurement();
            break;
        case 'suppliers':
            renderSuppliers();
            break;
        case 'feeds':
            renderFeeds();
            break;
        case 'carriers':
            renderCarriers();
            break;
        case 'audit':
            renderAudit();
            break;
    }
}

function renderOverview() {
    // Stats
    const totalOrders = mockData.customerOrders.length;
    const totalPOs = mockData.purchaseOrders.length;
    const readyOrders = mockData.customerOrders.filter(o => o.deficit === 0).length;
    const waitingOrders = mockData.customerOrders.filter(o => o.deficit > 0).length;
    const partialOrders = 2;

    const pendingPOs = mockData.purchaseOrders.filter(p => p.status === 'PENDING_APPROVAL').length;
    const sentPOs = mockData.purchaseOrders.filter(p => p.status === 'SENT').length;
    const receivedPOs = mockData.purchaseOrders.filter(p => p.status === 'RECEIVED').length;

    document.getElementById('stat-total-orders').textContent = totalOrders;
    document.getElementById('stat-ready').textContent = readyOrders;
    document.getElementById('stat-waiting').textContent = waitingOrders;
    document.getElementById('stat-partial').textContent = partialOrders;

    document.getElementById('stat-total-po').textContent = totalPOs;
    document.getElementById('stat-po-pending').textContent = pendingPOs;
    document.getElementById('stat-po-sent').textContent = sentPOs;
    document.getElementById('stat-po-received').textContent = receivedPOs;

    // Kritické
    const criticalList = document.getElementById('critical-list');
    const critical = [
        { severity: 'danger', msg: 'ORD-2026-003: Chybí 15 ks Klobouků — žádný dodavatel nemá skladem najednou' },
        { severity: 'warning', msg: 'PO-2026-0002: Čeká na schválení — nákup za 675 Kč' },
        { severity: 'warning', msg: 'Feed XYZ Distribution: Poslední update byla včera (18:00)' },
    ];

    criticalList.innerHTML = critical.map((item) => `
        <div class="alert-item" style="border-left-color: ${item.severity === 'danger' ? '#ef4444' : '#f59e0b'}">
            <strong>${item.severity === 'danger' ? '⚠️ KRITICKÉ' : '⚠️ UPOZORNĚNÍ'}</strong>
            ${item.msg}
        </div>
    `).join('');

    // Update badges
    document.getElementById('badge-orders').textContent = waitingOrders;
    document.getElementById('badge-procurement').textContent = pendingPOs;
}

function renderOrders() {
    const tbody = document.querySelector('#orders-table tbody');
    tbody.innerHTML = mockData.customerOrders.map((order) => `
        <tr class="table-clickable">
            <td><strong>${order.orderId}</strong></td>
            <td>${order.customerName}</td>
            <td>${order.quantity} ks</td>
            <td>
                <span class="status-badge ${order.deficit === 0 ? 'status-ready' : (order.deficit < order.quantity / 2 ? 'status-pending' : 'status-waiting')}">
                    ${order.deficit === 0 ? '✓ Připraveno' : (order.ownStockQuantity > 0 ? '⚠ Částečně' : '❌ Čeká')}
                </span>
            </td>
            <td>${order.deficit > 0 ? `<strong style="color: #ef4444">${order.deficit} ks</strong>` : '-'}</td>
            <td><button class="btn btn-secondary" onclick="alert('Detail: ${order.orderId}')">Detaily</button></td>
        </tr>
    `).join('');
}

function renderAvailability() {
    // Own stock
    const ownStockEl = document.getElementById('own-stock');
    ownStockEl.innerHTML = mockData.customerOrders.map((order) => `
        <div class="stock-item">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <strong>${order.sku}</strong>
                <span style="color: #10b981; font-weight: 700;">${order.ownStockQuantity} ks</span>
            </div>
            <div style="font-size: 11px; color: #6b7280;">Poptávka: ${order.quantity} ks → Deficit: ${order.deficit} ks</div>
        </div>
    `).join('');

    // Supplier stock
    const supplierStockEl = document.getElementById('supplier-stock');
    const supplierStock = {};
    mockData.supplierOffers.forEach((offer) => {
        if (!supplierStock[offer.productId]) supplierStock[offer.productId] = [];
        supplierStock[offer.productId].push(offer);
    });

    supplierStockEl.innerHTML = Object.entries(supplierStock).map(([productId, offers]) => `
        <div class="stock-item">
            <div style="font-weight: 700; margin-bottom: 6px;">${productId}</div>
            ${offers.map((o) => `
                <div style="font-size: 11px; margin-bottom: 4px;">
                    <span style="color: #6b7280;">${o.supplierSku}</span> →
                    <strong style="color: #3b82f6;">${o.availableQuantity} ks</strong>
                    <span style="color: #9ca3af;">(${o.unitPrice} Kč, ${o.leadTimeDays}d)</span>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function renderProcurement() {
    const filterBtn = document.querySelectorAll('.filter-btn');
    filterBtn.forEach((btn) => {
        btn.addEventListener('click', () => {
            filterBtn.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            state.procurementFilter = btn.dataset.filter;
            renderProcurement();
        });
    });

    let filtered = mockData.purchaseOrders;
    if (state.procurementFilter !== 'all') {
        filtered = filtered.filter((po) => po.status === state.procurementFilter);
    }

    const list = document.getElementById('procurement-list');
    list.innerHTML = filtered.map((po) => {
        const value = po.lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0);
        const statusColor = {
            PENDING_APPROVAL: '#f59e0b',
            SENT: '#3b82f6',
            RECEIVED: '#10b981',
        }[po.status];

        return `
            <div class="procurement-item">
                <div class="procurement-item-header">
                    <span class="procurement-item-id">${po.id}</span>
                    <span class="status-badge" style="background-color: ${statusColor}; color: white;">
                        ${po.status === 'PENDING_APPROVAL' ? '⏳ Schval.' : (po.status === 'SENT' ? '📤 Poslán' : '✓ Přijat')}
                    </span>
                </div>
                <div class="procurement-item-rows">
                    <div class="procurement-item-row">
                        <span>Dodavatel:</span>
                        <strong>${mockData.suppliers.find((s) => s.id === po.supplierId)?.name || po.supplierId}</strong>
                    </div>
                    <div class="procurement-item-row">
                        <span>Položky:</span>
                        <strong>${po.lines.length}</strong>
                    </div>
                    <div class="procurement-item-row">
                        <span>Celkem ks:</span>
                        <strong>${po.lines.reduce((sum, l) => sum + l.quantity, 0)}</strong>
                    </div>
                    <div class="procurement-item-row">
                        <span>Cena:</span>
                        <strong style="color: #10b981;">${value} Kč</strong>
                    </div>
                </div>
                ${po.status === 'PENDING_APPROVAL' ? `<button class="btn btn-primary" style="margin-top: 8px; width: 100%;" onclick="alert('Schválení PO: ${po.id}')">✓ Schválit</button>` : ''}
            </div>
        `;
    }).join('');

    document.getElementById('filter-pending').textContent = mockData.purchaseOrders.filter((p) => p.status === 'PENDING_APPROVAL').length;
}

function renderSuppliers() {
    const list = document.getElementById('suppliers-list');
    list.innerHTML = mockData.suppliers.map((sup) => {
        const offers = mockData.supplierOffers.filter((o) => o.supplierId === sup.id);
        return `
            <div class="supplier-item">
                <div class="supplier-item-header">
                    <span class="supplier-item-id">${sup.name}</span>
                    <span class="status-badge" style="background-color: ${sup.feedStatus === 'active' ? '#10b981' : '#f59e0b'}; color: white;">
                        ${sup.feedStatus === 'active' ? '✓ Aktivní' : '⚠ Upozornění'}
                    </span>
                </div>
                <div class="supplier-item-rows">
                    <div class="supplier-item-row">
                        <span>Feed:</span>
                        <strong>${sup.feedType}</strong>
                    </div>
                    <div class="supplier-item-row">
                        <span>Termín:</span>
                        <strong>${sup.leadTime}</strong>
                    </div>
                    <div class="supplier-item-row">
                        <span>Produkty:</span>
                        <strong>${offers.length}</strong>
                    </div>
                    <div class="supplier-item-row">
                        <span>Poslední sync:</span>
                        <strong>${sup.lastUpdate}</strong>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderFeeds() {
    const list = document.getElementById('feeds-list');
    list.innerHTML = mockData.feeds.map((feed) => `
        <div class="feed-item">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <strong>${feed.supplier}</strong>
                <span class="status-badge" style="background-color: ${feed.status === 'ok' ? '#10b981' : '#f59e0b'}; color: white;">
                    ${feed.status === 'ok' ? '✓ OK' : '⚠ Upozornění'}
                </span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
                <div><span style="color: #6b7280;">Typ:</span> <strong>${feed.type}</strong></div>
                <div><span style="color: #6b7280;">URL:</span> <strong>${feed.url.substring(0, 30)}...</strong></div>
                <div><span style="color: #6b7280;">Produkty:</span> <strong>${feed.productsCount}</strong></div>
                <div><span style="color: #6b7280;">Poslední:</span> <strong>${feed.lastSuccess}</strong></div>
            </div>
        </div>
    `).join('');
}

function renderCarriers() {
    const list = document.getElementById('carriers-list');
    list.innerHTML = mockData.carriers.map((car) => `
        <div class="carrier-item">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <strong>${car.name} — ${car.service}</strong>
                <span style="font-size: 11px; background: #eff6ff; color: #3b82f6; padding: 2px 8px; border-radius: 4px;">✓ Aktivní</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
                <div><span style="color: #6b7280;">Cena:</span> <strong>${car.cost}</strong></div>
                <div><span style="color: #6b7280;">Doručení:</span> <strong>${car.delivery}</strong></div>
            </div>
        </div>
    `).join('');
}

function renderAudit() {
    const list = document.getElementById('audit-list');
    list.innerHTML = mockData.auditLog.map((log) => `
        <tr>
            <td>${log.timestamp}</td>
            <td><strong>${log.type}</strong></td>
            <td>${log.entityId}</td>
            <td style="font-size: 12px; color: #6b7280;">${log.detail}</td>
        </tr>
    `).join('');
}

// ==============================================
// Init
// ==============================================

document.getElementById('btn-refresh').addEventListener('click', () => {
    alert('Obnovení dat... (demo mockuje API volání)');
    renderCurrentSection();
});

// Start
switchSection('overview');
