// Presentation dictionary & labels (100% Czech, E-shopper terminology)
const StatusMeta = {
    READY_TO_FULFILL: { label: 'Připraveno k vyřízení', class: 'status-ready', desc: 'Všechny položky jsou na skladě a spárovány. Můžete zabalit a předat dopravci.' },
    READY_TO_SHIP: { label: 'Připraveno k vyřízení', class: 'status-ready', desc: 'Všechny položky jsou na skladě a spárovány. Můžete zabalit a předat dopravci.' },
    PARTIALLY_AVAILABLE: { label: 'Částečně skladem', class: 'status-warning', desc: 'Část zboží máme na vlastním skladě, zbytek je objednán u dodavatele.' },
    WAITING_FOR_STOCK: { label: 'Čeká na dodání zboží', class: 'status-pending', desc: 'Zboží chybí na skladě. Systém sestavil nákup a čeká na doručení od dodavatele.' },
    PENDING_APPROVAL: { label: 'Čeká na schválení', class: 'status-pending', desc: 'Systém připravil objednávku u dodavatele. Čeká na vaše potvrzení k odeslání.' },
    SENT: { label: 'Odesláno dodavateli', class: 'status-info', desc: 'Objednávka byla odeslána dodavateli. Čekáme na doručení balíku na sklad.' },
    RECEIVED: { label: 'Kompletně naskladněno a přiřazeno', class: 'status-ready', desc: 'Zboží bylo přijato na sklad a automaticky spárováno se zákazníky.' },
    PARTIALLY_RECEIVED: { label: 'Částečně naskladněno', class: 'status-warning', desc: 'Část balíku již dorazila, zbývající kusy jsou stále na cestě.' },
    EXCEPTION: { label: 'Vyžaduje vaše rozhodnutí', class: 'status-exception', desc: 'Výjimka vyžadující ruční rozhodnutí e-shopaře.' },
};

function getStatusMeta(status, isException = false) {
    if (isException) return StatusMeta.EXCEPTION;
    return StatusMeta[status] || { label: status, class: 'status-pending', desc: 'Zpracování objednávky' };
}

// Initial Mock Sandbox State
const InitialState = {
    customerOrders: [
        {
            orderId: 'OBJ-2026-001245',
            customerName: 'Jan Novák (cistytriko.cz)',
            status: 'READY_TO_FULFILL',
            createdAt: 'Dnes, 10:30',
            estimatedShipDate: 'Dnes do 17:00 (ihned k expedici)',
            items: [
                { sku: 'TRIKO-BASIC-BLK-M', productName: 'Čistý triko Basic Černé (vel. M)', required: 2, stock: 2, incoming: 0, received: 2, waiting: 0, allocated: 2 },
                { sku: 'TRIKO-HEAVY-WHT-L', productName: 'Čistý triko Heavy Bílé (vel. L)', required: 1, stock: 1, incoming: 0, received: 1, waiting: 0, allocated: 1 },
            ],
            procurement: [
                { poId: 'NÁKUP-2026-08-001', supplier: 'Fox Outdoor', quantity: 2, eta: '29. srpna (zítra)', status: 'Doručeno a naskladněno' },
            ],
            problem: null,
            auditTrail: [
                { time: '11:15', actor: 'SYSTEM', action: 'Stav v e-shopu Shoptet byl automaticky aktualizován na „Připraveno k expedici“.' },
                { time: '11:14', actor: 'SYSTEM', action: 'Zboží přijato od dodavatele Fox Outdoor a automaticky přiřazeno k této objednávce.' },
                { time: '10:31', actor: 'SYSTEM', action: 'Automatická kontrola skladu: Chyběly 2 ks. Systém vytvořil nákup u dodavatele Fox Outdoor.' },
            ],
        },
        {
            orderId: 'OBJ-2026-001246',
            customerName: 'Petra Dvořáková (ZP Florence)',
            status: 'WAITING_FOR_STOCK',
            createdAt: 'Dnes, 12:00',
            estimatedShipDate: '30. srpna (po doručení od dodavatelů)',
            items: [
                { sku: 'MED-BANDAGE-10CM', productName: 'Elastické obinadlo 10cm', required: 6, stock: 0, incoming: 6, received: 0, waiting: 6, allocated: 0 },
            ],
            procurement: [
                { poId: 'NÁKUP-2026-08-002', supplier: 'Helikon-Tex', quantity: 4, eta: '30. srpna', status: 'Čeká na schválení' },
                { poId: 'NÁKUP-2026-08-003', supplier: 'Brandit CZ', quantity: 2, eta: '30. srpna', status: 'Čeká na schválení' },
            ],
            problem: {
                title: 'Žádný jednotlivý dodavatel nemá celé požadované množství',
                detail: 'Zákazník objednal 6 ks. Hlavní dodavatel Helikon-Tex má k dispozici pouze 4 ks (chybí 2 ks).',
                suggestion: 'Tuto položku objednáme od 2 dodavatelů, protože žádný z nich nemá celé potřebné množství: 4 ks Helikon-Tex (skladem u partnera) + 2 ks Brandit CZ (záložní partner).',
            },
            auditTrail: [
                { time: '12:02', actor: 'SYSTEM', action: 'Systém rozdělil nákup mezi 2 dodavatele: 4 ks Helikon-Tex + 2 ks Brandit CZ.' },
                { time: '12:01', actor: 'SYSTEM', action: 'Zákazník objednal 6 ks. Na vlastním skladě je 0 ks (chybí 6 ks).' },
            ],
        },
        {
            orderId: 'OBJ-2026-001247',
            customerName: 'Karel Vlček (cistytriko.cz)',
            status: 'READY_TO_SHIP',
            createdAt: 'Dnes, 09:10',
            estimatedShipDate: 'Dnes do 17:00 (ihned k expedici)',
            items: [
                { sku: 'BATOH-35L-OLV', productName: 'Taktický batoh 35L Olive Green', required: 1, stock: 1, incoming: 0, received: 1, waiting: 0, allocated: 1 },
            ],
            procurement: [
                { poId: 'NÁKUP-2026-08-003', supplier: 'Brandit CZ', quantity: 1, eta: '28. srpna', status: 'Doručeno na sklad' },
            ],
            problem: null,
            auditTrail: [
                { time: '14:20', actor: 'SYSTEM', action: 'Zboží doručeno a přiřazeno. Balík je připraven k zabalení.' },
            ],
        },
        {
            orderId: 'OBJ-2026-001248',
            customerName: 'Martina Malá (ZP Florence)',
            status: 'READY_TO_SHIP',
            createdAt: 'Dnes, 15:00',
            estimatedShipDate: 'Dnes do 17:00 (ihned k expedici)',
            items: [
                { sku: 'SOCK-TERMO-L', productName: 'Termo ponožky merino (vel. L)', required: 6, stock: 6, incoming: 0, received: 6, waiting: 0, allocated: 6 },
            ],
            procurement: [],
            problem: null,
            auditTrail: [
                { time: '15:00', actor: 'SYSTEM', action: 'Všechny položky byly 100% skladem. Objednávka je ihned připravena k zabalení.' },
            ],
        },
    ],
    purchaseOrders: [
        {
            id: 'NÁKUP-2026-08-001',
            supplier: 'Fox Outdoor',
            status: 'PENDING_APPROVAL',
            itemsCount: 4,
            totalPcs: 12,
            targetOrders: 'OBJ-2026-001245 (Jan Novák) a další 2 zákazníci',
            eta: '29. srpna (zítra)',
            note: 'Doplnění chybějících černých triček velikosti M a L',
            reason: 'Vybrán hlavní dodavatel s nejnižší cenou a dodáním do 24 hodin.',
        },
        {
            id: 'NÁKUP-2026-08-002',
            supplier: 'Helikon-Tex',
            status: 'PENDING_APPROVAL',
            itemsCount: 1,
            totalPcs: 4,
            targetOrders: 'OBJ-2026-001246 (Petra Dvořáková - část A)',
            eta: '30. srpna',
            note: 'Elastická obinadla 10cm (4 ks)',
            reason: 'Objednána maximální dostupná zásoba u hlavního dodavatele (4 ks).',
        },
        {
            id: 'NÁKUP-2026-08-003',
            supplier: 'Brandit CZ',
            status: 'PENDING_APPROVAL',
            itemsCount: 1,
            totalPcs: 2,
            targetOrders: 'OBJ-2026-001246 (Petra Dvořáková - část B)',
            eta: '30. srpna',
            note: 'Elastická obinadla 10cm (2 ks - rozdělení nákupu)',
            reason: 'Záložní partner vybrán pro doobjednání zbývajících 2 ks.',
        },
    ],
    exceptions: [
        {
            id: 'VÝJIMKA-001',
            type: 'Nemáme nabídku žádného dodavatele',
            detail: 'Zboží „Taktická obuv vel. 43“ (kód OBUV-TAKTICKA-43) nemá v katalogu žádného aktivního dodavatele. Zákazník čeká na 2 ks.',
            severity: 'VYSOKÁ',
            affectedOrder: 'OBJ-2026-001249',
            cause: 'Dodavatel ukončil distribuci této velikosti.',
            suggestion: 'Kontaktujte zákazníka s nabídkou alternativního modelu nebo ověřte dostupnost u nového dodavatele.',
        },
        {
            id: 'VÝJIMKA-002',
            type: 'Došlo méně kusů, než bylo objednáno',
            detail: 'V balíku od Fox Outdoor dorazilo 11 ks místo objednaných 12 ks (chybí 1 ks trička Basic vel. M).',
            severity: 'STŘEDNÍ',
            affectedOrder: 'NÁKUP-2026-08-001',
            cause: 'Dodavatel vykrátil položku na dodacím listu.',
            suggestion: 'Systém automaticky doobjedná 1 chybějící kus u záložního dodavatele Brandit CZ.',
        },
    ],
    suppliers: [
        { name: 'Fox Outdoor', priority: '1. Hlavní partner', leadTime: '1-2 dny', reliability: '99%', minOrder: 'Bez limitu (0 Kč)', note: 'Primární dodavatel pro textil a outdoor vybavení.' },
        { name: 'Helikon-Tex', priority: '2. Specializovaný partner', leadTime: '2-3 dny', reliability: '98%', minOrder: '500 Kč', note: 'Specialista na zdravotnický materiál a taktickou výstroj.' },
        { name: 'Brandit CZ', priority: '3. Záložní dodavatel', leadTime: '3-4 dny', reliability: '95%', minOrder: '1 000 Kč', note: 'Aktivován při výpadku skladu u hlavních partnerů (rozdělení nákupu).' },
    ],
};

// Global Reactive State Engine
class AppState {
    constructor() {
        this.data = JSON.parse(JSON.stringify(InitialState));
        this.currentView = 'dashboard';
        this.selectedOrder = null;
    }

    reset() {
        this.data = JSON.parse(JSON.stringify(InitialState));
        this.render();
        showToast('Demo data byla úspěšně resetována do výchozího stavu.', 'success');
    }

    approveAllPOs() {
        const count = this.data.purchaseOrders.filter(p => p.status === 'PENDING_APPROVAL').length;
        this.data.purchaseOrders.forEach(p => {
            if (p.status === 'PENDING_APPROVAL') p.status = 'SENT';
        });
        this.render();
        showToast(`Schváleno ${count} nákupních objednávek. Byly předány dodavatelům a systém čeká na doručení.`, 'success');
    }

    approvePO(poId) {
        const po = this.data.purchaseOrders.find(p => p.id === poId);
        if (po) {
            po.status = 'SENT';
            this.render();
            showToast(`Nákup ${poId} u dodavatele ${po.supplier} byl schválen a odeslán!`, 'success');
        }
    }

    receiveGoods(poId) {
        const po = this.data.purchaseOrders.find(p => p.id === poId);
        if (po) {
            po.status = 'RECEIVED';
            // Auto-fulfill waiting customer orders
            this.data.customerOrders.forEach(ord => {
                if (ord.status === 'WAITING_FOR_STOCK') {
                    ord.status = 'READY_TO_FULFILL';
                    ord.estimatedShipDate = 'Dnes do 17:00 (ihned k expedici)';
                    ord.items.forEach(it => {
                        it.stock = it.required;
                        it.allocated = it.required;
                        it.received = it.required;
                        it.waiting = 0;
                        it.incoming = 0;
                    });
                    ord.auditTrail.unshift({
                        time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
                        actor: 'SYSTEM',
                        action: `Zboží z nákupu ${poId} bylo přijato na sklad a automaticky přiřazeno k této objednávce. Objednávka je připravena k zabalení!`,
                    });
                }
            });
            this.render();
            showToast(`Balík z ${poId} byl přijat! ${po.totalPcs} ks bylo automaticky přiřazeno k zákaznickým objednávkám.`, 'success');
        }
    }

    resolveException(excId) {
        const idx = this.data.exceptions.findIndex(e => e.id === excId);
        if (idx !== -1) {
            this.data.exceptions.splice(idx, 1);
            this.render();
            showToast(`Výjimka ${excId} byla úspěšně vyřešena a přepočítána s alternativním partnerem.`, 'success');
        }
    }

    confirmSplitProposal(orderId) {
        const ord = this.data.customerOrders.find(o => o.orderId === orderId);
        if (ord) {
            ord.problem = null;
            ord.auditTrail.unshift({
                time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
                actor: 'USER',
                action: 'Schválen návrh rozdělení nákupu: 4 ks Helikon-Tex + 2 ks Brandit CZ.',
            });
            this.render();
            if (this.selectedOrder && this.selectedOrder.orderId === orderId) {
                openOrderDetailModal(ord);
            }
            showToast(`Návrh rozdělení nákupu pro objednávku ${orderId} byl potvrzen.`, 'success');
        }
    }

    overrideOrderSupplier(orderId, newSupplier) {
        const ord = this.data.customerOrders.find(o => o.orderId === orderId);
        if (ord) {
            const oldSupplier = ord.procurement.length > 0 ? ord.procurement[0].supplier : 'Žádný';
            if (ord.procurement.length > 0) ord.procurement[0].supplier = newSupplier;
            ord.auditTrail.unshift({
                time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
                actor: 'USER',
                action: `Ruční změna dodavatele z „${oldSupplier}“ na „${newSupplier}“.`,
            });
            this.render();
            if (this.selectedOrder && this.selectedOrder.orderId === orderId) {
                openOrderDetailModal(ord);
            }
            showToast(`Dodavatel byl ručně změněn na ${newSupplier}.`, 'success');
        }
    }

    overrideOrderQuantity(orderId, newQty) {
        const ord = this.data.customerOrders.find(o => o.orderId === orderId);
        if (ord) {
            const oldQty = ord.items.length > 0 ? ord.items[0].required : 0;
            if (ord.items.length > 0) ord.items[0].required = parseInt(newQty, 10);
            ord.auditTrail.unshift({
                time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
                actor: 'USER',
                action: `Ruční úprava požadovaného množství z ${oldQty} ks na ${newQty} ks.`,
            });
            this.render();
            if (this.selectedOrder && this.selectedOrder.orderId === orderId) {
                openOrderDetailModal(ord);
            }
            showToast(`Množství bylo ručně upraveno na ${newQty} ks.`, 'success');
        }
    }

    runGuidedDemoCycle() {
        showToast('⚡ Krok 1/3: Schvaluji nákupní objednávky u dodavatelů...', 'info');
        this.approveAllPOs();
        setTimeout(() => {
            showToast('⚡ Krok 2/3: Balíky od dodavatelů dorazily na sklad. Spouštím naskladnění a automatické přiřazení...', 'info');
            this.receiveGoods('NÁKUP-2026-08-001');
            this.receiveGoods('NÁKUP-2026-08-002');
            this.receiveGoods('NÁKUP-2026-08-003');
            setTimeout(() => {
                showToast('⚡ Krok 3/3: Hotovo! Všechny objednávky jsou naskladněné, spárované a připravené k expedici!', 'success');
            }, 1000);
        }, 1500);
    }

    render() {
        renderApp(this);
    }
}

const state = new AppState();

// Toast helper
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast-notification toast-${type} show`;
    setTimeout(() => { toast.className = 'toast-notification'; }, 4500);
}

// Main Render Function
function renderApp(app) {
    const d = app.data;

    // 1. Sidebar counters
    document.getElementById('sidebar-exceptions-count').textContent = d.exceptions.length;
    document.getElementById('sidebar-orders-count').textContent = d.customerOrders.length;
    const pendingCount = d.purchaseOrders.filter(p => p.status === 'PENDING_APPROVAL').length;
    document.getElementById('sidebar-po-count').textContent = pendingCount;

    // 2. Dashboard KPIs
    document.getElementById('kpi-pending-val').textContent = pendingCount;
    document.getElementById('kpi-exceptions-val').textContent = d.exceptions.length;
    const readyOrders = d.customerOrders.filter(o => o.status === 'READY_TO_FULFILL' || o.status === 'READY_TO_SHIP');
    document.getElementById('kpi-ready-val').textContent = readyOrders.length;

    // Column badge counts
    document.getElementById('pending-count').textContent = pendingCount;
    document.getElementById('exceptions-count').textContent = d.exceptions.length;
    document.getElementById('ready-count').textContent = readyOrders.length;

    // 3. Dashboard Column 1: Pending POs
    const pendingPOs = d.purchaseOrders.filter(p => p.status === 'PENDING_APPROVAL');
    const pendingListEl = document.getElementById('pending-list');
    pendingListEl.innerHTML = pendingPOs.length > 0 ? `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-md); padding: 12px; margin-bottom: 8px;">
            <b style="color: #92400e; font-size: 13px; display: block; margin-bottom: 2px;">
                ${pendingPOs.length} nákupy čekají na vaše schválení
            </b>
            <p style="font-size: 11px; color: #78350f; line-height: 1.35; margin-bottom: 8px;">
                Systém je automaticky připravil podle dostupnosti zboží a vybraných dodavatelů. Po schválení je odešle dodavatelům.
            </p>
            <button class="btn-action-red btn-sm" style="width: 100%;" onclick="window.appState.approveAllPOs()">
                ✓ Schválit všechny (${pendingPOs.length}) a odeslat dodavatelům
            </button>
            <span style="display: block; font-size: 10px; color: #92400e; margin-top: 4px; text-align: center;">
                Po schválení budou nákupy předány dodavatelům a systém začne hlídat termín doručení.
            </span>
        </div>
        ${pendingPOs.map(po => `
            <div class="item-card">
                <div class="item-card-header">
                    <div class="item-id-wrap">
                        <span class="item-tag">NÁKUP U DODAVATELE</span>
                        <span class="item-id">${po.id}</span>
                    </div>
                    <span class="status-pill status-pending">Čeká na schválení</span>
                </div>
                <div class="item-detail-text">
                    <b>🏢 Dodavatel: ${po.supplier}</b> &middot; ${po.itemsCount} položky (celkem ${po.totalPcs} ks)<br>
                    <small style="color: var(--text-subtle)"><b>Pro koho:</b> ${po.targetOrders}<br><b>Doručení:</b> ${po.eta}</small>
                </div>
                <div class="item-action-area">
                    <button class="btn-action-red btn-sm" onclick="window.appState.approvePO('${po.id}')">
                        ✓ Schválit nákup u ${po.supplier}
                    </button>
                    <span class="action-hint-text">Schválením potvrdíte objednání tohoto zboží u dodavatele.</span>
                </div>
            </div>
        `).join('')}
    ` : '<div style="padding: 20px; text-align: center; color: var(--text-subtle); font-size: 13px;">Všechny nákupy jsou schválené. Žádné objednávky nečekají.</div>';

    // 4. Dashboard Column 2: Exceptions
    const exceptionsListEl = document.getElementById('exceptions-list');
    exceptionsListEl.innerHTML = d.exceptions.length > 0 ? d.exceptions.map(exc => `
        <div class="item-card" style="border-left: 3px solid var(--brand-red);">
            <div class="item-card-header">
                <div class="item-id-wrap">
                    <span class="item-tag" style="color: var(--brand-red)">VYŽADUJE ROZHODNUTÍ</span>
                    <span class="item-id">${exc.id}</span>
                </div>
                <span class="status-pill status-exception">${exc.severity}</span>
            </div>
            <div class="item-detail-text">
                <b style="color: var(--danger-text)">${exc.type}</b><br>
                <span>${exc.detail}</span>
            </div>
            <div class="item-action-area">
                <button class="btn-action-red btn-sm" onclick="window.appState.resolveException('${exc.id}')">
                    🔍 Zvolit náhradníka / Korigovat deficit
                </button>
                <span class="action-hint-text">Předá položku k přepočtu s alternativním dodavatelem.</span>
            </div>
        </div>
    `).join('') : '<div style="padding: 20px; text-align: center; color: var(--success-text); font-size: 13px;">Žádné výjimky. Vše běží v pořádku.</div>';

    // 5. Dashboard Column 3: Ready to ship
    const readyListEl = document.getElementById('ready-list');
    readyListEl.innerHTML = readyOrders.length > 0 ? readyOrders.map(ord => `
        <div class="item-card clickable-card" onclick="window.openOrder('${ord.orderId}')" style="border-left: 3px solid var(--success-text);">
            <div class="item-card-header">
                <div class="item-id-wrap">
                    <span class="item-tag" style="color: var(--success-text)">100% SKLADEM & SPÁROVÁNO</span>
                    <span class="item-id">${ord.orderId}</span>
                </div>
                <span class="status-pill status-ready">Připraveno k vyřízení</span>
            </div>
            <div class="item-detail-text">
                <b>👤 ${ord.customerName}</b><br>
                <span>${ord.items.map(it => `${it.productName} (${it.required} ks)`).join(', ')}</span><br>
                <small style="color: var(--success-text); font-weight: 700;">Expedice: ${ord.estimatedShipDate}</small>
            </div>
            <div class="item-action-area">
                <span style="font-size: 11px; font-weight: 700; color: var(--brand-red);">👉 Otevřít detail a expedovat &rarr;</span>
            </div>
        </div>
    `).join('') : '<div style="padding: 20px; text-align: center; color: var(--text-subtle); font-size: 13px;">Žádné objednávky nečekají na zabalení.</div>';

    // 6. View: Full Exceptions List
    const fullExcEl = document.getElementById('full-exceptions-list');
    if (fullExcEl) {
        fullExcEl.innerHTML = d.exceptions.length > 0 ? d.exceptions.map(exc => `
            <div class="item-card" style="border-left: 4px solid var(--brand-red); margin-bottom: 16px;">
                <div class="item-card-header">
                    <div>
                        <span class="item-tag" style="color: var(--brand-red)">VÝJIMKA ${exc.id}</span>
                        <h3 style="font-size: 16px; margin-top: 2px;">${exc.type}</h3>
                    </div>
                    <span class="status-pill status-exception">Závažnost: ${exc.severity}</span>
                </div>
                <div style="margin: 10px 0; font-size: 13px;">
                    <p style="margin-bottom: 6px;"><b>Popis problému:</b> ${exc.detail}</p>
                    <p style="margin-bottom: 6px; color: var(--text-muted);"><b>Proč vznikl:</b> ${exc.cause}</p>
                    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-sm); padding: 10px; margin-top: 8px;">
                        <b style="color: var(--brand-red); font-size: 12px; text-transform: uppercase;">Co systém navrhuje:</b>
                        <p style="font-size: 13px; color: #991b1b; margin-top: 2px;">${exc.suggestion}</p>
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
                    <button class="btn-action-red btn-sm" onclick="window.appState.resolveException('${exc.id}')">
                        ✓ Použít návrh systému (Zvolit náhradníka)
                    </button>
                    <button class="btn-secondary btn-sm" onclick="window.appState.resolveException('${exc.id}')">
                        Korigovat množství
                    </button>
                    <button class="btn-secondary btn-sm" onclick="window.appState.resolveException('${exc.id}')">
                        Vyřešit ručně
                    </button>
                </div>
            </div>
        `).join('') : '<p style="color: var(--success-text); font-weight: 600;">Všechny výjimky jsou vyřešené!</p>';
    }

    // 7. View: Full Customer Orders
    const fullOrdersEl = document.getElementById('full-orders-list');
    if (fullOrdersEl) {
        fullOrdersEl.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Číslo objednávky</th>
                        <th>Zákazník</th>
                        <th>Co zákazník objednal</th>
                        <th>Co máme skladem</th>
                        <th>Co chybí</th>
                        <th>Kdy lze vyřídit</th>
                        <th>Stav vyřízení</th>
                        <th>Akce</th>
                    </tr>
                </thead>
                <tbody>
                    ${d.customerOrders.map(ord => {
                        const isReady = ord.status === 'READY_TO_FULFILL' || ord.status === 'READY_TO_SHIP';
                        const totalReq = ord.items.reduce((s, i) => s + i.required, 0);
                        const totalStk = ord.items.reduce((s, i) => s + i.stock, 0);
                        const shortage = Math.max(0, totalReq - totalStk);
                        return `
                            <tr class="table-row-clickable" onclick="window.openOrder('${ord.orderId}')">
                                <td><b>${ord.orderId}</b><br><small style="color: var(--text-subtle)">${ord.createdAt}</small></td>
                                <td><b>${ord.customerName}</b></td>
                                <td>${ord.items.map(it => `<div>${it.productName} &times; <b>${it.required} ks</b></div>`).join('')}</td>
                                <td><span class="stock-badge-green">${totalStk} ks</span></td>
                                <td>
                                    ${shortage > 0 
                                        ? `<span class="shortage-badge-red" title="Tyto kusy nejsou na vlastním skladě a systém je objednává u dodavatele">Chybí ${shortage} ks</span>` 
                                        : '<span class="stock-badge-green">0 ks (kompletní)</span>'}
                                </td>
                                <td><small style="font-weight: 600;">${ord.estimatedShipDate}</small></td>
                                <td>
                                    <span class="status-pill ${isReady ? 'status-ready' : 'status-pending'}">
                                        ${isReady ? '✓ Připraveno k vyřízení' : '⏳ Čeká na dodání zboží'}
                                    </span>
                                </td>
                                <td>
                                    <button class="btn-secondary btn-sm" onclick="event.stopPropagation(); window.openOrder('${ord.orderId}')">Detail &rarr;</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    // 8. View: Full POs
    const fullPoEl = document.getElementById('full-po-list');
    if (fullPoEl) {
        fullPoEl.innerHTML = d.purchaseOrders.map(po => `
            <div class="item-card" style="margin-bottom: 14px;">
                <div class="item-card-header">
                    <div>
                        <span class="item-tag">NÁKUP U DODAVATELE</span>
                        <h3 style="font-size: 16px;">${po.id} &middot; 🏢 ${po.supplier}</h3>
                    </div>
                    <span class="status-pill ${po.status === 'RECEIVED' ? 'status-ready' : (po.status === 'SENT' ? 'status-info' : 'status-pending')}">
                        ${po.status === 'RECEIVED' ? 'Vše dorazilo a přiřazeno zákazníkům' : (po.status === 'SENT' ? 'Objednávka odeslána &middot; Čekáme na dodání' : 'Čeká na schválení')}
                    </span>
                </div>
                <div style="margin: 10px 0; font-size: 13px;">
                    <p><b>Položky:</b> ${po.itemsCount} položek (${po.totalPcs} ks) &middot; <b>Předpokládané doručení:</b> ${po.eta}</p>
                    <p style="color: var(--text-muted); margin-top: 2px;"><b>Pro které zákazníky:</b> ${po.targetOrders}</p>
                    <p style="color: var(--text-muted); margin-top: 2px;"><b>Proč to objednáváme:</b> ${po.reason}</p>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 10px;">
                    ${po.status === 'PENDING_APPROVAL' ? `
                        <button class="btn-action-red btn-sm" onclick="window.appState.approvePO('${po.id}')">
                            ✓ Schválit nákup u ${po.supplier}
                        </button>
                    ` : ''}
                    ${po.status === 'SENT' ? `
                        <button class="btn-action-red btn-sm" onclick="window.appState.receiveGoods('${po.id}')">
                            📥 Naskladnit balík & Přiřadit zákazníkům
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    // 9. View: Goods Receipt & Reconciliation
    const receivingEl = document.getElementById('receiving-list');
    if (receivingEl) {
        receivingEl.innerHTML = d.purchaseOrders.map(po => `
            <div class="item-card" style="margin-bottom: 14px;">
                <div class="item-card-header">
                    <div>
                        <span class="item-tag">PŘÍJEM BALÍKU</span>
                        <h3 style="font-size: 16px;">Zásilka z nákupu: ${po.id} &middot; ${po.supplier}</h3>
                    </div>
                    <span class="status-pill ${po.status === 'RECEIVED' ? 'status-ready' : 'status-pending'}">
                        ${po.status === 'RECEIVED' ? '✓ Zboží přijato a přiřazeno' : 'Čeká na fyzické převzetí balíku'}
                    </span>
                </div>
                <div style="margin: 10px 0; font-size: 13px;">
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: var(--bg-subtle); padding: 10px; border-radius: var(--radius-sm); margin-bottom: 8px;">
                        <div>
                            <span style="color: var(--text-subtle); display: block; font-size: 11px;">Co jsme objednali:</span>
                            <b>${po.totalPcs} ks</b>
                        </div>
                        <div>
                            <span style="color: var(--text-subtle); display: block; font-size: 11px;">Co skutečně dorazilo:</span>
                            <b style="color: ${po.status === 'RECEIVED' ? 'var(--success-text)' : 'var(--text-main)'};">${po.status === 'RECEIVED' ? po.totalPcs : 0} ks</b>
                        </div>
                        <div>
                            <span style="color: var(--text-subtle); display: block; font-size: 11px;">Co ještě chybí:</span>
                            <b>${po.status === 'RECEIVED' ? 0 : po.totalPcs} ks</b>
                        </div>
                    </div>
                    <p style="color: var(--text-muted); font-size: 12px;">
                        <b>Přiřazení:</b> Systém přiřadí zboží automaticky podle pořadí zákaznických objednávek (${po.targetOrders}).
                    </p>
                </div>
                ${po.status !== 'RECEIVED' ? `
                    <button class="btn-action-red btn-sm" onclick="window.appState.receiveGoods('${po.id}')">
                        📥 Potvrdit příjem balíku & Automaticky přiřadit k objednávkám
                    </button>
                ` : `
                    <span style="color: var(--success-text); font-weight: 700; font-size: 12px;">
                        ✓ ${po.totalPcs} ks bylo přijato a automaticky přiřazeno k čekajícím zákaznickým objednávkám.
                    </span>
                `}
            </div>
        `).join('');
    }

    // 10. View: Suppliers
    const suppliersEl = document.getElementById('suppliers-list');
    if (suppliersEl) {
        suppliersEl.innerHTML = d.suppliers.map(s => `
            <div class="item-card" style="margin-bottom: 14px;">
                <div class="item-card-header">
                    <div>
                        <span class="item-tag">INTEGROVANÝ PARTNER</span>
                        <h3 style="font-size: 16px;">🏢 ${s.name}</h3>
                    </div>
                    <span class="status-pill status-ready">${s.priority}</span>
                </div>
                <div style="margin: 8px 0; font-size: 13px;">
                    <p><b>Dodací lhůta:</b> ${s.leadTime} &middot; <b>Spolehlivost doručení:</b> ${s.reliability} &middot; <b>Minimální nákup:</b> ${s.minOrder}</p>
                    <p style="color: var(--text-muted); margin-top: 4px; font-size: 12px;">${s.note}</p>
                </div>
            </div>
        `).join('');
    }
}

// Open Order Detail Modal with Narrative Story & Explicit Checklist
function openOrderDetailModal(order) {
    state.selectedOrder = order;
    const modal = document.getElementById('order-modal');
    const title = document.getElementById('modal-order-title');
    const body = document.getElementById('modal-body');

    title.innerHTML = `Objednávka č. <span>${order.orderId}</span>`;

    const totalRequired = order.items.reduce((sum, it) => sum + it.required, 0);
    const totalStock = order.items.reduce((sum, it) => sum + it.stock, 0);
    const totalReceived = order.items.reduce((sum, it) => sum + (it.received || 0), 0);
    const totalWaiting = order.items.reduce((sum, it) => sum + (it.waiting || 0), 0);
    const shortage = Math.max(0, totalRequired - totalStock);
    const isReady = order.status === 'READY_TO_FULFILL' || order.status === 'READY_TO_SHIP' || shortage === 0;

    body.innerHTML = `
        <!-- Explicit Status Checklist -->
        <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px;">
            <h4 style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: var(--text-subtle); margin-bottom: 12px; letter-spacing: 0.05em;">
                PŘEHLED EXPEDICE & POLOŽEK
            </h4>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; font-size: 12px;">
                <div style="background: var(--bg-subtle); padding: 10px; border-radius: var(--radius-sm);">
                    <span style="color: var(--text-subtle); display: block;">Co zákazník objednal:</span>
                    <b style="font-size: 15px;">${totalRequired} ks</b>
                </div>
                <div style="background: var(--bg-subtle); padding: 10px; border-radius: var(--radius-sm);">
                    <span style="color: var(--text-subtle); display: block;">Co máme skladem:</span>
                    <b style="font-size: 15px; color: var(--success-text);">${totalStock} ks</b>
                </div>
                <div style="background: var(--bg-subtle); padding: 10px; border-radius: var(--radius-sm);">
                    <span style="color: var(--text-subtle); display: block;">Co chybí dodat:</span>
                    <b style="font-size: 15px; color: ${shortage > 0 ? 'var(--brand-red)' : 'var(--success-text)'};">${shortage} ks</b>
                </div>
                <div style="background: var(--bg-subtle); padding: 10px; border-radius: var(--radius-sm);">
                    <span style="color: var(--text-subtle); display: block;">Kdy lze vyřídit:</span>
                    <b style="font-size: 13px; color: var(--text-main);">${order.estimatedShipDate}</b>
                </div>
            </div>
        </div>

        <!-- 1. Narrative Story of the Order -->
        <div class="story-box">
            <div class="story-header">
                <span style="font-size: 16px;">📖</span>
                <span class="story-title">Příběh vyřízení objednávky</span>
            </div>
            
            <div class="story-step-item">
                <div class="story-badge-num">1</div>
                <div class="story-body">
                    <b>Co zákazník objednal:</b> Zákazník <b>${order.customerName}</b> objednal celkem <b>${totalRequired} ks</b> zboží.
                </div>
            </div>

            <div class="story-step-item ${shortage > 0 ? 'highlight-danger' : 'highlight-success'}">
                <div class="story-badge-num">2</div>
                <div class="story-body">
                    <b>Co máme skladem a co chybí:</b> Na vlastním skladě máme <span class="stock-badge-green">${totalStock} ks</span>. 
                    ${shortage > 0 
                        ? `<span class="shortage-badge-red">Chybí ${shortage} ks</span> (tyto kusy nejsou na skladě a systém je objednává u dodavatele)` 
                        : '<span class="stock-badge-green">Vše je 100% skladem</span>'}
                </div>
            </div>

            <div class="story-step-item">
                <div class="story-badge-num">3</div>
                <div class="story-body">
                    <b>Co systém objednal u dodavatelů:</b> 
                    ${order.procurement.length > 0 
                        ? `${order.procurement.map(p => `<b>${p.supplier}</b> (${p.quantity} ks &middot; ${p.status})`).join(' + ')}`
                        : 'Vše bylo skladem, nebyl nutný nákup u dodavatele.'}
                </div>
            </div>

            <div class="story-step-item ${isReady ? 'highlight-success' : 'highlight-danger'}">
                <div class="story-badge-num">4</div>
                <div class="story-body">
                    <b>Co čeká na vás / Co bude následovat:</b> 
                    ${isReady 
                        ? '<b>Objednávka je kompletní a připravena k vyřízení!</b> Můžete vytisknout štítek, zabalit zboží a předat dopravci.' 
                        : 'Čekáme na potvrzení/doručení zboží od dodavatele. Po příjezdu balíku systém položky ihned automaticky přiřadí k objednávce.'}
                </div>
            </div>
        </div>

        <!-- Problem & System Suggestion Box (If applicable) -->
        ${order.problem ? `
            <div style="background: #fff1f2; border: 1px solid #fecdd3; border-left: 4px solid var(--brand-red); border-radius: var(--radius-md); padding: 16px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="font-size: 16px;">⚠️</span>
                    <b style="font-size: 13px; text-transform: uppercase; color: var(--brand-red); letter-spacing: 0.05em;">PROBLÉM</b>
                </div>
                <p style="font-size: 13px; font-weight: 700; color: #9f1239; margin-bottom: 4px;">${order.problem.title}</p>
                <p style="font-size: 12px; color: #881337; margin-bottom: 12px;">${order.problem.detail}</p>
                
                <div style="background: #ffffff; border: 1px solid #fda4af; border-radius: var(--radius-sm); padding: 12px; margin-bottom: 12px;">
                    <b style="font-size: 12px; color: var(--brand-red); text-transform: uppercase; display: block; margin-bottom: 4px;">CO SYSTÉM NAVRHUJE</b>
                    <p style="font-size: 13px; color: #0f172a; line-height: 1.4;">${order.problem.suggestion}</p>
                </div>

                <b style="font-size: 11px; text-transform: uppercase; color: #9f1239; display: block; margin-bottom: 6px;">CO MŮŽETE UDĚLAT:</b>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="btn-action-red btn-sm" onclick="window.appState.confirmSplitProposal('${order.orderId}')">
                        ✓ Potvrdit návrh rozdělení nákupu
                    </button>
                    <button class="btn-secondary btn-sm" onclick="const q = prompt('Zadejte upravené množství:', '6'); if(q) window.appState.overrideOrderQuantity('${order.orderId}', q);">
                        Upravit množství
                    </button>
                    <button class="btn-secondary btn-sm" onclick="const s = prompt('Zadejte alternativního dodavatele:', 'Brandit CZ'); if(s) window.appState.overrideOrderSupplier('${order.orderId}', s);">
                        Vybrat jiného dodavatele
                    </button>
                </div>
            </div>
        ` : ''}

        <!-- 2. Items Table -->
        <div>
            <h4 style="font-size: 14px; font-weight: 800; margin-bottom: 8px;">Položky zákaznické objednávky</h4>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Produkt</th>
                        <th>Objednáno</th>
                        <th>Vlastní sklad</th>
                        <th>Na cestě / Dorazilo</th>
                        <th>Přiřazeno k expedici</th>
                        <th>Stav položky</th>
                    </tr>
                </thead>
                <tbody>
                    ${order.items.map(it => `
                        <tr>
                            <td><b>${it.productName}</b><br><small style="color: var(--text-subtle)">Kód: ${it.sku}</small></td>
                            <td><b>${it.required} ks</b></td>
                            <td>${it.stock} ks</td>
                            <td>${it.received || it.stock} ks dorazilo / ${it.waiting || 0} ks na cestě</td>
                            <td><b style="color: var(--success-text)">${it.allocated} ks</b></td>
                            <td>
                                <span class="status-pill ${it.allocated >= it.required ? 'status-ready' : 'status-pending'}">
                                    ${it.allocated >= it.required ? '✓ Skladem & připraveno' : '⏳ Čeká na dodání'}
                                </span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- 3. Audit Trail -->
        <div>
            <h4 style="font-size: 14px; font-weight: 800; margin-bottom: 8px;">Historie rozhodnutí a audit</h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                ${order.auditTrail.map(a => `
                    <div style="background: var(--bg-subtle); padding: 8px 12px; border-radius: var(--radius-sm); border-left: 3px solid ${a.actor === 'USER' ? 'var(--brand-red)' : 'var(--info-text)'}; font-size: 12px;">
                        <span style="font-family: monospace; color: var(--text-subtle); margin-right: 8px;">${a.time}</span>
                        ${a.actor === 'USER' ? '<span class="manual-override-badge">Upraveno ručně uživatelem</span>' : '<b style="color: var(--info-text)">🤖 Automatický systém:</b>'}
                        <span style="margin-left: 6px;">${a.action}</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- 4. Manual Overrides Center -->
        <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px;">
            <h4 style="font-size: 13px; font-weight: 800; color: var(--brand-red); text-transform: uppercase; margin-bottom: 10px;">
                Možnosti ručního zásahu (Ruční úpravy)
            </h4>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn-secondary btn-sm" onclick="const s = prompt('Zadejte nového dodavatele:', 'Brandit CZ'); if(s) window.appState.overrideOrderSupplier('${order.orderId}', s);">
                    Změnit dodavatele...
                </button>
                <button class="btn-secondary btn-sm" onclick="const q = prompt('Zadejte nový počet kusů:', '10'); if(q) window.appState.overrideOrderQuantity('${order.orderId}', q);">
                    Upravit množství...
                </button>
                <button class="btn-action-red btn-sm" onclick="window.appState.receiveGoods('NÁKUP-2026-08-001');">
                    Naskladnit položky ihned
                </button>
            </div>
        </div>
    `;

    modal.classList.add('active');
}

// ============================================================
// SUPPLIER MANAGEMENT VIEW RENDERING
// ============================================================
function renderSuppliersManagement(app) {
    const suppliersEl = document.getElementById('suppliers-list');
    if (!suppliersEl) return;
    const suppliers = app.data.suppliers;

    suppliersEl.innerHTML = suppliers.map((s, idx) => `
        <div class="item-card" style="margin-bottom: 14px;">
            <div class="item-card-header">
                <div>
                    <span class="item-tag">PARTNER č. ${s.priority} · ${s.statusLabel.toUpperCase()}</span>
                    <h3 style="font-size: 17px; margin-top: 2px;">🏢 ${s.name}</h3>
                </div>
                <span class="status-pill ${s.status === 'ACTIVE' ? 'status-ready' : 'status-pending'}">${s.statusLabel}</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 12px 0; font-size: 12px;">
                <div style="background: var(--bg-subtle); padding: 10px; border-radius: var(--radius-sm);">
                    <span style="color: var(--text-subtle); display: block; font-size: 11px;">Co od něj nakupujeme:</span>
                    <b>${s.categoryDescription}</b>
                </div>
                <div style="background: var(--bg-subtle); padding: 10px; border-radius: var(--radius-sm);">
                    <span style="color: var(--text-subtle); display: block; font-size: 11px;">Dodací lhůta:</span>
                    <b>${s.leadTimeLabel}</b>
                </div>
                <div style="background: var(--bg-subtle); padding: 10px; border-radius: var(--radius-sm);">
                    <span style="color: var(--text-subtle); display: block; font-size: 11px;">Způsob objednání:</span>
                    <b>${s.orderMethod}</b>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; font-size: 12px;">
                <div>
                    <span style="color: var(--text-subtle);">Minimální nákup: </span><b>${s.minOrderLabel}</b>
                </div>
                <div>
                    <span style="color: var(--text-subtle);">Propojených produktů: </span><b>${s.mappedProductsCount} variant</b>
                </div>
                <div>
                    <span style="color: var(--text-subtle);">Poslední aktualizace nabídky: </span><b>${s.lastCatalogSync}</b>
                </div>
            </div>
            ${s.note ? `<p style="font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: 4px;">${s.note}</p>` : ''}
            <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
                <button class="btn-secondary btn-sm" onclick="window.appState.changePriority(${idx}, ${idx - 1})">
                    ↑ Zvýšit prioritu
                </button>
                <button class="btn-secondary btn-sm" onclick="window.appState.changePriority(${idx}, ${idx + 1})">
                    ↓ Snížit prioritu
                </button>
                <button class="btn-secondary btn-sm" onclick="window.appState.toggleSupplierStatus('${s.name}')">
                    ${s.status === 'ACTIVE' ? '⏸ Pozastavit spolupráci' : '▶ Reaktivovat dodavatele'}
                </button>
            </div>
        </div>
    `).join('');
}

// ============================================================
// PRODUCT CATALOG & VARIANT MAPPING VIEW
// ============================================================
function renderProductsCatalog(app, searchTerm = '') {
    const el = document.getElementById('products-catalog-list');
    if (!el) return;

    // Build grouped product view from mappings
    const mappings = app.data.mappings || [];
    const productGroups = {};

    mappings.forEach(m => {
        if (!productGroups[m.productId]) {
            productGroups[m.productId] = {
                productId: m.productId,
                productName: m.productName,
                variants: {},
            };
        }
        if (!productGroups[m.productId].variants[m.variantId]) {
            productGroups[m.productId].variants[m.variantId] = {
                variantId: m.variantId,
                variantName: m.variantName,
                eshopSku: m.eshopSku,
                supplierMappings: [],
            };
        }
        productGroups[m.productId].variants[m.variantId].supplierMappings.push(m);
    });

    const products = Object.values(productGroups);

    // Apply search filter
    const filtered = searchTerm.trim().length > 1
        ? products.filter(p => {
            const term = searchTerm.toLowerCase();
            const allVariants = Object.values(p.variants);
            return p.productName.toLowerCase().includes(term)
                || allVariants.some(v => v.eshopSku.toLowerCase().includes(term))
                || allVariants.some(v => v.supplierMappings.some(m => m.supplierSku.toLowerCase().includes(term)));
        })
        : products;

    if (filtered.length === 0) {
        el.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-subtle);">Žádné produkty neodpovídají hledanému výrazu. <button class="btn-secondary btn-sm" onclick="document.getElementById('product-search-input').value=''; window.renderProductsCatalog();">Zrušit filtr</button></div>`;
        return;
    }

    el.innerHTML = filtered.map(product => {
        const allVariants = Object.values(product.variants);
        const totalMappings = allVariants.reduce((s, v) => s + v.supplierMappings.length, 0);

        return `
            <div class="product-catalog-card">
                <div class="product-catalog-header">
                    <div>
                        <span class="item-tag">PRODUKT</span>
                        <h3 class="product-main-title">${product.productName}</h3>
                        <span style="font-size: 12px; color: var(--text-muted);">${allVariants.length} varianty &middot; propojeno na ${totalMappings} dodavatelských záznamů</span>
                    </div>
                </div>

                ${allVariants.map(variant => `
                    <div class="variant-card-box">
                        <div class="variant-title-bar">
                            <div>
                                <span class="item-tag" style="margin-right: 6px;">VARIANTA</span>
                                <b style="font-size: 14px;">${variant.variantName}</b>
                                <span style="font-size: 12px; color: var(--text-subtle); margin-left: 8px;">E-shopový kód: <code style="background: var(--bg-subtle); padding: 2px 6px; border-radius: 4px;">${variant.eshopSku}</code></span>
                            </div>
                            <button class="btn-action-red btn-sm" onclick="window.appState.addMappingForVariant('${product.productId}', '${variant.variantId}')">
                                + Přidat dodavatele
                            </button>
                        </div>

                        <div style="font-size: 12px; font-weight: 800; color: var(--text-subtle); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                            Propojení na dodavatele (seřazeno podle priority):
                        </div>

                        ${variant.supplierMappings
                            .sort((a, b) => a.priority - b.priority)
                            .map(m => `
                            <div class="supplier-mapping-item">
                                <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                                    <span class="mapping-priority-pill">Priorita ${m.priority}</span>
                                    <b style="font-size: 13px;">${m.supplierName}</b>
                                    <span style="color: var(--text-subtle);">Kód dodavatele: <code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${m.supplierSku}</code></span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 16px; font-size: 12px; text-align: right;">
                                    <div>
                                        <span style="color: var(--text-subtle); display: block; font-size: 11px;">Nákupní cena:</span>
                                        <b>${m.purchasePriceCzk} Kč / ks</b>
                                    </div>
                                    <div>
                                        <span style="color: var(--text-subtle); display: block; font-size: 11px;">Skladem u partnera:</span>
                                        <b style="color: ${m.supplierStock > 0 ? 'var(--success-text)' : 'var(--danger-text)'};">${m.supplierStock} ks</b>
                                    </div>
                                    <div>
                                        <span style="color: var(--text-subtle); display: block; font-size: 11px;">Dodací lhůta:</span>
                                        <b>${m.leadTimeDays} ${m.leadTimeDays === 1 ? 'den' : 'dny'}</b>
                                    </div>
                                    <div style="display: flex; gap: 6px;">
                                        <span class="status-pill ${m.active ? 'status-ready' : 'status-pending'}">${m.active ? 'Aktivní' : 'Neaktivní'}</span>
                                        <button class="btn-secondary btn-sm" title="Změnit prioritu nebo deaktivovat" onclick="window.appState.toggleMappingActive('${m.id}')">
                                            ${m.active ? 'Deaktivovat' : 'Aktivovat'}
                                        </button>
                                        <button class="btn-secondary btn-sm" title="Upravit nákupní cenu a dodací kód" onclick="window.appState.editMapping('${m.id}')">
                                            Upravit
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
}

// ============================================================
// AUDIT TRAIL VIEW (manual interventions log)
// ============================================================
function renderAuditTrail(app) {
    const el = document.getElementById('interventions-audit-list');
    if (!el) return;

    const records = app.data.globalAuditTrail || [];

    if (records.length === 0) {
        el.innerHTML = `<p style="color: var(--text-subtle); padding: 16px; font-size: 13px;">Zatím nebyly provedeny žádné ruční zásahy. Všechna rozhodnutí jsou automatická.</p>`;
        return;
    }

    el.innerHTML = `
        <table class="audit-table">
            <thead>
                <tr>
                    <th>Čas</th>
                    <th>Typ změny</th>
                    <th>Čeho se týká</th>
                    <th>Původní hodnota (systém navrhl)</th>
                    <th>Nová hodnota (uživatel změnil)</th>
                    <th>Provedl</th>
                </tr>
            </thead>
            <tbody>
                ${records.map(r => `
                    <tr>
                        <td style="font-family: monospace; font-size: 11px; color: var(--text-subtle);">${r.timestamp}</td>
                        <td>
                            <span class="manual-override-badge">${r.targetType === 'SUPPLIER_SELECTION' ? 'Změna dodavatele' 
                                : r.targetType === 'ORDER_QUANTITY' ? 'Změna množství'
                                : r.targetType === 'GOODS_RECEIPT' ? 'Korekce příjmu'
                                : r.targetType === 'ALLOCATION' ? 'Přeřazení zboží'
                                : 'Ruční zásah'}</span>
                        </td>
                        <td><b>${r.targetId}</b>${r.orderId ? `<br><small style="color:var(--text-subtle)">Objednávka: ${r.orderId}</small>` : ''}</td>
                        <td style="color: var(--text-muted);">
                            <s>${r.originalValue}</s>
                        </td>
                        <td style="font-weight: 700; color: var(--brand-red);">${r.newValue}</td>
                        <td>
                            <span style="font-size: 12px; color: var(--text-muted);">👤 ${r.user}</span>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ============================================================
// NAVIGATION VIEW SWITCHER (extended for 8 views)
// ============================================================
function setupNavigation() {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            navItems.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const viewName = btn.getAttribute('data-view');
            switchView(viewName);
        });
    });

    // KPI cards click navigation
    document.querySelectorAll('.clickable-kpi').forEach(card => {
        card.addEventListener('click', () => {
            const targetView = card.getAttribute('data-target-view');
            if (targetView) {
                navItems.forEach(b => {
                    if (b.getAttribute('data-view') === targetView) b.classList.add('active');
                    else b.classList.remove('active');
                });
                switchView(targetView);
            }
        });
    });

    // Onboarding guide toggle
    const guideToggle = document.getElementById('btn-guide-toggle');
    const guidePanel = document.getElementById('workflow-guide-panel');
    const closeGuide = document.getElementById('btn-close-guide');
    if (guideToggle && guidePanel) {
        guideToggle.onclick = () => {
            guidePanel.classList.toggle('hidden');
            guideToggle.textContent = guidePanel.classList.contains('hidden') ? 'Zobrazit rychlého průvodce' : 'Skrýt průvodce';
        };
    }
    if (closeGuide && guidePanel) {
        closeGuide.onclick = () => {
            guidePanel.classList.add('hidden');
            if (guideToggle) guideToggle.textContent = 'Zobrazit rychlého průvodce';
        };
    }

    // Product search
    const searchInput = document.getElementById('product-search-input');
    const clearSearch = document.getElementById('btn-clear-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderProductsCatalog(state, searchInput.value);
        });
    }
    if (clearSearch && searchInput) {
        clearSearch.onclick = () => {
            searchInput.value = '';
            renderProductsCatalog(state, '');
        };
    }

    // Add supplier dialog (mock)
    const btnAddSupplier = document.getElementById('btn-add-supplier-dialog');
    if (btnAddSupplier) {
        btnAddSupplier.onclick = () => {
            const name = prompt('Zadejte název nového dodavatele:');
            if (name) {
                state.data.suppliers.push({
                    id: `SUP-${Date.now()}`,
                    name,
                    status: 'ACTIVE',
                    statusLabel: 'Aktivní partner',
                    categoryDescription: 'Nový dodavatel - doplňte sortiment',
                    priority: state.data.suppliers.length + 1,
                    leadTimeDays: 3,
                    leadTimeLabel: '3 pracovní dny',
                    minOrderAmountCzk: 0,
                    minOrderLabel: 'Bez limitu',
                    orderMethod: 'E-mail s tabulkou',
                    lastCatalogSync: 'Zatím nebyla synchronizována nabídka',
                    mappedProductsCount: 0,
                    note: 'Nově přidaný partner - nastavte produkty v sekci Produkty & Mapování.',
                });
                state.render();
                showToast(`Dodavatel „${name}" byl přidán. Nyní propojte jeho produkty v sekci Produkty & Mapování.`, 'success');
            }
        };
    }

    // Add mapping dialog (mock)
    const btnAddMapping = document.getElementById('btn-add-mapping-dialog');
    if (btnAddMapping) {
        btnAddMapping.onclick = () => {
            const sku = prompt('Zadejte e-shopový kód produktu (SKU):');
            if (sku) {
                showToast(`Pro SKU "${sku}" nyní vyhledejte produkt v katalogu a přiřaďte dodavatele kliknutím na „+ Přidat dodavatele".`, 'info');
                const searchInput = document.getElementById('product-search-input');
                if (searchInput) {
                    searchInput.value = sku;
                    renderProductsCatalog(state, sku);
                }
            }
        };
    }

    // Settings save
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
        btnSaveSettings.onclick = () => {
            const strategyRadio = document.querySelector('input[name="procurementStrategy"]:checked');
            const allowSplit = document.getElementById('setting-allow-split');
            const requireApproval = document.getElementById('setting-require-approval');

            const strategyLabels = {
                SPLIT_BALANCED: 'Vyvážená strategie',
                FASTEST: 'Nejrychlejší doručení',
                CHEAPEST: 'Nejnižší nákupní cena',
            };

            const stratVal = strategyRadio ? strategyRadio.value : 'SPLIT_BALANCED';
            state.data.procurementSettings = {
                defaultStrategy: stratVal,
                allowMultiSupplierSplit: allowSplit ? allowSplit.checked : true,
                requireApproval: requireApproval ? requireApproval.checked : true,
            };

            showToast(`Nastavení uloženo: ${strategyLabels[stratVal] || stratVal}. Všechny nové nákupy budou řídit tímto pravidlem.`, 'success');
        };
    }
}

function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    const targetSection = document.getElementById(`view-${viewName}`);
    if (targetSection) targetSection.classList.add('active');

    const titles = {
        dashboard: { eyebrow: 'PŘEHLED DNE', title: 'Řízení nákupu a expedice' },
        exceptions: { eyebrow: 'VÝJIMKY & RUČNÍ ZÁSAHY', title: 'Vyžaduje vaši akci' },
        orders: { eyebrow: 'ZÁKAZNICKÉ OBJEDNÁVKY', title: 'Stav vyřízení a expedice' },
        procurement: { eyebrow: 'NÁKUP', title: 'Nákupy u dodavatelů' },
        receiving: { eyebrow: 'SKLAD', title: 'Příjem zboží & Naskladnění' },
        suppliers: { eyebrow: 'SPRÁVA', title: 'Dodavatelé' },
        products: { eyebrow: 'PRODUKTY', title: 'Produkty & Mapování na dodavatele' },
        settings: { eyebrow: 'NASTAVENÍ', title: 'Pravidla automatického nákupu' },
    };

    const t = titles[viewName] || titles.dashboard;
    document.getElementById('view-eyebrow').textContent = t.eyebrow;
    document.getElementById('view-title').textContent = t.title;

    // Trigger view-specific rendering
    if (viewName === 'products') renderProductsCatalog(state, '');
    if (viewName === 'suppliers') renderSuppliersManagement(state);
    if (viewName === 'exceptions') renderAuditTrail(state);
}

// ============================================================
// STATE EXTENSIONS FOR NEW VIEWS
// ============================================================

// Extend AppState with new methods
const _origReset = AppState.prototype.reset;
AppState.prototype.reset = function() {
    this.data.mappings = getInitialMappings();
    this.data.globalAuditTrail = [];
    this.data.procurementSettings = {
        defaultStrategy: 'SPLIT_BALANCED',
        allowMultiSupplierSplit: true,
        requireApproval: true,
    };
    _origReset.call(this);
};

AppState.prototype.changePriority = function(currentIdx, newIdx) {
    const suppliers = this.data.suppliers;
    if (newIdx < 0 || newIdx >= suppliers.length) {
        showToast('Prioritu nelze dále zvýšit/snížit.', 'info');
        return;
    }
    const temp = suppliers[currentIdx];
    suppliers[currentIdx] = suppliers[newIdx];
    suppliers[newIdx] = temp;
    // Re-number priorities
    suppliers.forEach((s, i) => { s.priority = i + 1; });
    this.render();
    renderSuppliersManagement(this);
    showToast(`Priorita dodavatele „${suppliers[newIdx].name}" byla aktualizována.`, 'success');
};

AppState.prototype.toggleSupplierStatus = function(supplierName) {
    const s = this.data.suppliers.find(s => s.name === supplierName);
    if (s) {
        s.status = s.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
        s.statusLabel = s.status === 'ACTIVE' ? 'Aktivní partner' : 'Pozastaveno';
        this.render();
        renderSuppliersManagement(this);
        showToast(`Stav dodavatele „${supplierName}" byl změněn na „${s.statusLabel}".`, 'success');
    }
};

AppState.prototype.toggleMappingActive = function(mappingId) {
    const m = (this.data.mappings || []).find(m => m.id === mappingId);
    if (m) {
        const was = m.active;
        m.active = !m.active;
        // Record audit
        this.addToGlobalAudit({
            targetType: 'SUPPLIER_SELECTION',
            targetId: mappingId,
            originalValue: `${m.supplierName} – ${was ? 'Aktivní' : 'Neaktivní'}`,
            newValue: `${m.supplierName} – ${m.active ? 'Aktivní' : 'Neaktivní'}`,
            reason: 'Ruční zapnutí/vypnutí mapování dodavatele',
            user: 'E-shopař',
        });
        renderProductsCatalog(this, '');
        showToast(`Mapování ${m.eshopSku} → ${m.supplierName} bylo ${m.active ? 'aktivováno' : 'deaktivováno'}.`, 'success');
    }
};

AppState.prototype.editMapping = function(mappingId) {
    const m = (this.data.mappings || []).find(m => m.id === mappingId);
    if (m) {
        const oldPrice = m.purchasePriceCzk;
        const newPriceStr = prompt(`Zadejte novou nákupní cenu (Kč/ks) pro ${m.productName} / ${m.variantName} od ${m.supplierName}:`, m.purchasePriceCzk);
        if (newPriceStr && !isNaN(Number(newPriceStr))) {
            const newPrice = Number(newPriceStr);
            m.purchasePriceCzk = newPrice;
            this.addToGlobalAudit({
                targetType: 'SUPPLIER_SELECTION',
                targetId: mappingId,
                originalValue: `${m.supplierName}: ${oldPrice} Kč/ks`,
                newValue: `${m.supplierName}: ${newPrice} Kč/ks`,
                reason: 'Ruční úprava nákupní ceny',
                user: 'E-shopař',
            });
            renderProductsCatalog(this, '');
            showToast(`Nákupní cena pro ${m.productName} (${m.variantName}) od ${m.supplierName} aktualizována na ${newPrice} Kč/ks.`, 'success');
        }
    }
};

AppState.prototype.addMappingForVariant = function(productId, variantId) {
    const supplierName = prompt('Zadejte název dodavatele pro tuto variantu:', 'Fox Outdoor');
    if (!supplierName) return;
    const supplierSku = prompt(`Zadejte dodavatelský kód (SKU) od ${supplierName}:`, 'FOX-NEW-SKU');
    if (!supplierSku) return;
    const priceStr = prompt('Zadejte nákupní cenu (Kč/ks):', '100');
    const price = Number(priceStr) || 0;

    const existingForVariant = (this.data.mappings || []).filter(m => m.variantId === variantId);
    const newPriority = existingForVariant.length + 1;
    const existingVariant = existingForVariant[0];

    const newMapping = {
        id: `MAP-${Date.now()}`,
        productId,
        productName: existingVariant ? existingVariant.productName : 'Produkt',
        variantId,
        variantName: existingVariant ? existingVariant.variantName : 'Varianta',
        eshopSku: existingVariant ? existingVariant.eshopSku : 'SKU',
        supplierId: `SUP-${supplierName.replace(/\s/g, '').toUpperCase()}`,
        supplierName,
        supplierSku,
        purchasePriceCzk: price,
        supplierStock: 0,
        leadTimeDays: 3,
        priority: newPriority,
        active: true,
    };

    if (!this.data.mappings) this.data.mappings = [];
    this.data.mappings.push(newMapping);

    this.addToGlobalAudit({
        targetType: 'SUPPLIER_SELECTION',
        targetId: newMapping.id,
        originalValue: 'Bez dodavatele',
        newValue: `${supplierName} (${supplierSku}, ${price} Kč/ks)`,
        reason: 'Ruční přidání nového propojení produktu na dodavatele',
        user: 'E-shopař',
    });

    renderProductsCatalog(this, '');
    showToast(`Varianta byla propojena s ${supplierName} pod kódem ${supplierSku}.`, 'success');
};

AppState.prototype.addToGlobalAudit = function(record) {
    if (!this.data.globalAuditTrail) this.data.globalAuditTrail = [];
    this.data.globalAuditTrail.unshift({
        ...record,
        id: `AUDIT-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
    });
};

// Initial mappings data (sandbox mock)
function getInitialMappings() {
    return [
        {
            id: 'MAP-001', productId: 'PROD-TRIKO-BASIC', productName: 'Čistý triko Basic',
            variantId: 'VAR-BLK-M', variantName: 'Černá / M', eshopSku: 'TRIKO-BASIC-BLK-M',
            supplierId: 'SUP-FOX', supplierName: 'Fox Outdoor', supplierSku: 'FOX-TSHIRT-BLK-M',
            purchasePriceCzk: 120, supplierStock: 45, leadTimeDays: 1, priority: 1, active: true,
        },
        {
            id: 'MAP-002', productId: 'PROD-TRIKO-BASIC', productName: 'Čistý triko Basic',
            variantId: 'VAR-BLK-M', variantName: 'Černá / M', eshopSku: 'TRIKO-BASIC-BLK-M',
            supplierId: 'SUP-BRANDIT', supplierName: 'Brandit CZ', supplierSku: 'BR-BASIC-BLK-M',
            purchasePriceCzk: 135, supplierStock: 20, leadTimeDays: 3, priority: 2, active: true,
        },
        {
            id: 'MAP-003', productId: 'PROD-OBINADLO', productName: 'Elastické obinadlo 10cm',
            variantId: 'VAR-10CM-DEFAULT', variantName: '10cm × 5m', eshopSku: 'MED-BANDAGE-10CM',
            supplierId: 'SUP-HELIKON', supplierName: 'Helikon-Tex', supplierSku: 'HEL-MED-BAND-10',
            purchasePriceCzk: 45, supplierStock: 4, leadTimeDays: 2, priority: 1, active: true,
        },
        {
            id: 'MAP-004', productId: 'PROD-OBINADLO', productName: 'Elastické obinadlo 10cm',
            variantId: 'VAR-10CM-DEFAULT', variantName: '10cm × 5m', eshopSku: 'MED-BANDAGE-10CM',
            supplierId: 'SUP-BRANDIT', supplierName: 'Brandit CZ', supplierSku: 'BR-ELAST-BAND-10',
            purchasePriceCzk: 52, supplierStock: 25, leadTimeDays: 3, priority: 2, active: true,
        },
        {
            id: 'MAP-005', productId: 'PROD-BATOH', productName: 'Taktický batoh 35L',
            variantId: 'VAR-OLV-ONE', variantName: 'Olive Green / Univerzální', eshopSku: 'BATOH-35L-OLV',
            supplierId: 'SUP-BRANDIT', supplierName: 'Brandit CZ', supplierSku: 'BR-BAG-35L-OG',
            purchasePriceCzk: 890, supplierStock: 8, leadTimeDays: 3, priority: 1, active: true,
        },
    ];
}

// Initialize mappings in initial state
state.data.mappings = getInitialMappings();
state.data.globalAuditTrail = [];
state.data.procurementSettings = { defaultStrategy: 'SPLIT_BALANCED', allowMultiSupplierSplit: true, requireApproval: true };

// Expose product catalog renderer globally for search
window.renderProductsCatalog = () => {
    const searchInput = document.getElementById('product-search-input');
    renderProductsCatalog(state, searchInput ? searchInput.value : '');
};

// ============================================================
// GLOBAL BINDINGS & INIT
// ============================================================

window.appState = state;
window.openOrder = (orderId) => {
    const ord = state.data.customerOrders.find(o => o.orderId === orderId);
    if (ord) openOrderDetailModal(ord);
};

// Modal close
document.getElementById('modal-close-btn').onclick = () => document.getElementById('order-modal').classList.remove('active');
document.getElementById('order-modal').onclick = (e) => {
    if (e.target === document.getElementById('order-modal')) document.getElementById('order-modal').classList.remove('active');
};

// Reset & guided demo
document.getElementById('btn-reset-demo').onclick = () => state.reset();
document.getElementById('btn-sim-cycle').onclick = () => state.runGuidedDemoCycle();

// Init
setupNavigation();
state.render();

