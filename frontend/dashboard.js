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
        {
            id: 'SUP-FOX', name: 'Fox Outdoor', status: 'ACTIVE', statusLabel: 'Aktivní partner',
            categoryDescription: 'Textil, outdoor oblečení, základní sortiment',
            priority: 1, leadTimeDays: 1, leadTimeLabel: '1–2 pracovní dny',
            minOrderAmountCzk: 0, minOrderLabel: 'Bez limitu (0 Kč)',
            orderMethod: 'XML feed + e-mail potvrzení',
            lastCatalogSync: 'Dnes, 08:15 (125 SKU)',
            mappedProductsCount: 48,
            note: 'Primární dodavatel pro textil a outdoor vybavení. Nejvyšší spolehlivost doručení (99%).',
        },
        {
            id: 'SUP-HELIKON', name: 'Helikon-Tex', status: 'ACTIVE', statusLabel: 'Aktivní partner',
            categoryDescription: 'Zdravotnický materiál, taktická výstroj',
            priority: 2, leadTimeDays: 2, leadTimeLabel: '2–3 pracovní dny',
            minOrderAmountCzk: 500, minOrderLabel: 'Min. 500 Kč',
            orderMethod: 'CSV ceník + e-mail',
            lastCatalogSync: 'Včera, 22:00 (87 SKU)',
            mappedProductsCount: 21,
            note: 'Specialista na zdravotnický materiál. Aktivní pro obinadla, dlahy, obvazy a taktické vybavení.',
        },
        {
            id: 'SUP-BRANDIT', name: 'Brandit CZ', status: 'ACTIVE', statusLabel: 'Aktivní partner',
            categoryDescription: 'Batohy, taktické příslušenství, záložní sortiment',
            priority: 3, leadTimeDays: 3, leadTimeLabel: '3–4 pracovní dny',
            minOrderAmountCzk: 1000, minOrderLabel: 'Min. 1 000 Kč',
            orderMethod: 'E-mail s tabulkou objednávky',
            lastCatalogSync: 'Dnes, 07:45 (203 SKU)',
            mappedProductsCount: 34,
            note: 'Záložní partner — aktivován při výpadku skladu hlavních dodavatelů nebo pro rozdělení nákupu.',
        },
    ],
};

// Global Reactive State Engine
class AppState {
    constructor() {
        this.data = JSON.parse(JSON.stringify(InitialState));
        this.currentView = 'dashboard';
        this.selectedOrder = null;
        this.orderSearchQuery = '';
        this.orderFilter = 'ALL';
    }

    reset() {
        this.data = JSON.parse(JSON.stringify(InitialState));
        this.orderSearchQuery = '';
        this.orderFilter = 'ALL';
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

    addOrderNote(orderId) {
        const ord = this.data.customerOrders.find(o => o.orderId === orderId);
        const input = document.getElementById('new-note-input');
        if (ord && input && input.value.trim()) {
            const noteText = input.value.trim();
            if (!ord.notes) ord.notes = [];
            ord.notes.push(noteText);
            ord.auditTrail.unshift({
                time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
                actor: 'USER',
                action: `Přidána poznámka k objednávce: "${noteText}".`,
            });
            this.render();
            if (this.selectedOrder && this.selectedOrder.orderId === orderId) {
                openOrderDetailModal(ord);
            }
            showToast('Poznámka byla přidána a uložena.', 'success');
        }
    }

    processBarcodeScan(code) {
        if (!code || !code.trim()) return;
        const query = code.trim().toUpperCase();
        const d = this.data;

        // 1. Try matching Purchase Order ID
        const po = d.purchaseOrders.find(p => p.id.toUpperCase() === query);
        if (po) {
            this.receiveGoods(po.id);
            this.showToast(`📷 Nákupní balík ${po.id} naskladněn skenerem!`, 'success');
            return;
        }

        // 2. Try matching Customer Order ID
        const ord = d.customerOrders.find(o => o.orderId.toUpperCase() === query);
        if (ord) {
            window.openOrder(ord.orderId);
            this.showToast(`📷 Objednávka ${ord.orderId} otevřena přes skener!`, 'success');
            return;
        }

        // 3. Try matching SKU item across orders
        const matchingOrder = d.customerOrders.find(o => o.items.some(i => i.sku.toUpperCase() === query));
        if (matchingOrder) {
            window.openOrder(matchingOrder.orderId);
            this.showToast(`📷 Nalezena objednávka ${matchingOrder.orderId} s položkou ${query}!`, 'success');
            return;
        }

        this.showToast(`⚠️ Kód '${query}' nebyl nalezen v otevřených balících ani objednávkách.`, 'danger');
    }

    shipOrder(orderId) {
        const ord = this.data.customerOrders.find(o => o.orderId === orderId);
        if (!ord) return;
        const carriers = ['DPD', 'Zásilkovna', 'PPL', 'Česká pošta'];
        const carrier = carriers[Math.floor(Math.random() * carriers.length)];
        const trackingNumber = `${carrier.replace(/\s/g, '').toUpperCase().slice(0,3)}-${Date.now().toString().slice(-9)}`;
        ord.status = 'SHIPPED';
        ord.carrier = carrier;
        ord.trackingNumber = trackingNumber;
        ord.trackingInfo = `Zásilka byla předána dopravci ${carrier}. Zákazník byl informován e-mailem.`;
        ord.estimatedShipDate = 'Expedováno';
        ord.auditTrail.unshift({
            time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
            actor: 'USER',
            action: `Objednávka expedována. Dopravce: ${carrier} · Číslo zásilky: ${trackingNumber}`,
        });
        this.addToGlobalAudit({
            targetType: 'SYSTEM_ACTION',
            targetId: orderId,
            originalValue: 'Připraveno k expedici',
            newValue: `Expedováno — ${carrier} (${trackingNumber})`,
            reason: 'E-shopař potvrdil předání zásilky dopravci.',
            user: 'E-shopař',
        });
        this.render();
        if (this.selectedOrder && this.selectedOrder.orderId === orderId) {
            openOrderDetailModal(ord);
        }
        showToast(`📦 Objednávka ${orderId} expedována! Dopravce: ${carrier} · Zásilka: ${trackingNumber}`, 'success');
    }

    printLabel(orderId) {
        const ord = this.data.customerOrders.find(o => o.orderId === orderId);
        if (!ord) return;
        const carrier = ord.carrier || 'DPD';
        const tracking = ord.trackingNumber || `LABEL-${Date.now().toString().slice(-8)}`;
        // Simulate label print dialog
        const labelWindow = window.open('', '_blank', 'width=420,height=320,toolbar=no,menubar=no');
        if (labelWindow) {
            labelWindow.document.write(`
                <html><head><title>Štítek — ${orderId}</title>
                <style>body{font-family:monospace;padding:20px;background:#fff;} .box{border:3px solid #000;padding:16px;} .big{font-size:24px;font-weight:900;} .barcode{font-size:48px;letter-spacing:4px;margin:12px 0;} hr{border-color:#000;}</style>
                </head><body>
                <div class="box">
                    <div style="font-size:11px;text-transform:uppercase;">Odesílatel: Váš E-shop s.r.o.</div>
                    <hr/>
                    <div class="big">${carrier}</div>
                    <div class="barcode">|||||| ${tracking} ||||||</div>
                    <hr/>
                    <div><b>Příjemce:</b> ${ord.customerName}</div>
                    <div style="margin-top:8px;font-size:11px;">Objednávka: ${orderId} · ${ord.items.map(i => i.productName + ' ×' + i.required).join(', ')}</div>
                    <div style="margin-top:12px;font-size:10px;color:#666;">[DEMO ŠTÍTEK — není reálný tisk]</div>
                </div>
                <script>window.print();<\/script>
                </body></html>`);
            labelWindow.document.close();
        }
        showToast(`🖨️ Štítek pro ${orderId} (${carrier}) odeslán na tiskárnu.`, 'success');
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
    ` : '<div style="padding: 20px; text-align: center; color: var(--text-subtle);">Všechny nákupy jsou schválené. Žádné objednávky nečekají.</div>';

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
    `).join('') : '<div style="padding: 20px; text-align: center; color: var(--success-text);">Žádné výjimky. Vše běží v pořádku.</div>';

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
            <div class="item-action-area" style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn-secondary btn-sm" onclick="event.stopPropagation(); window.appState.printLabel('${ord.orderId}')" title="Vytisknout přepravní štítek">
                    🖨️ Vytisknout štítek
                </button>
                <button class="btn-action-red btn-sm" onclick="event.stopPropagation(); window.appState.shipOrder('${ord.orderId}')" class="btn-success">
                    📦 Expedovat
                </button>
            </div>
        </div>
    `).join('') : '<div style="padding: 20px; text-align: center; color: var(--text-subtle);">Žádné objednávky nečekají na zabalení.</div>';

    // 6. View: Full Exceptions List
    const fullExcEl = document.getElementById('full-exceptions-list');
    if (fullExcEl) {
        fullExcEl.innerHTML = d.exceptions.length > 0 ? d.exceptions.map(exc => `
            <div class="item-card" style="border-left: 4px solid var(--brand-red); margin-bottom: 16px;">
                <div class="item-card-header">
                    <div>
                        <span class="item-tag" style="color: var(--brand-red)">VÝJIMKA ${exc.id}</span>
                        <h3 class="card-title">EXC.TYPE}</h3>
                    </div>
                    <span class="status-pill status-exception">Závažnost: ${exc.severity}</span>
                </div>
                <div class="mb-3">
                    <p style="margin-bottom: 6px;"><b>Popis problému:</b> ${exc.detail}</p>
                    <p style="margin-bottom: 6px; color: var(--text-muted);"><b>Proč vznikl:</b> ${exc.cause}</p>
                    <div class="alert-box alert-danger mt-2">
                        <span class="alert-title">Co systém navrhuje:</span>
                        <p class="alert-body">${exc.suggestion}</p>
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
        let filteredOrders = d.customerOrders;

        // Apply Search Query
        if (app.orderSearchQuery && app.orderSearchQuery.trim()) {
            const query = app.orderSearchQuery.toLowerCase();
            filteredOrders = filteredOrders.filter(ord => 
                ord.orderId.toLowerCase().includes(query) || 
                ord.customerName.toLowerCase().includes(query)
            );
        }

        // Apply Filter State
        if (app.orderFilter === 'READY') {
            filteredOrders = filteredOrders.filter(ord => ord.status === 'READY_TO_FULFILL' || ord.status === 'READY_TO_SHIP');
        } else if (app.orderFilter === 'WAITING') {
            filteredOrders = filteredOrders.filter(ord => ord.status === 'WAITING_FOR_STOCK');
        }

        fullOrdersEl.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Číslo objednávky</th>
                        <th>Zákazník</th>
                        <th>Co zákazník objednal</th>
                        <th>Alokováno z vlastního skladu</th>
                        <th>Celková fyzická zásoba</th>
                        <th>Co chybí</th>
                        <th>Kdy lze vyřídit</th>
                        <th>Stav vyřízení</th>
                        <th>Akce</th>
                    </tr>
                </thead>
                <tbody>
                     ${filteredOrders.length > 0 ? filteredOrders.map(ord => {
                         const isReady = ord.status === 'READY_TO_FULFILL' || ord.status === 'READY_TO_SHIP';
                         const isShipped = ord.status === 'SHIPPED';
                         const isWaiting = ord.status === 'WAITING_FOR_STOCK';
                         const isException = ord.status === 'EXCEPTION';
                         const totalReq = ord.items.reduce((s, i) => s + i.required, 0);
                         const totalStk = ord.items.reduce((s, i) => s + i.stock, 0);
                         const shortage = Math.max(0, totalReq - totalStk);

                         // Status pill
                         const statusPill = isShipped
                             ? `<span class="status-pill status-info">📦 Expedováno</span>`
                             : isReady
                                 ? `<span class="status-pill status-ready">✓ Připraveno k vyřízení</span>`
                                 : isException
                                     ? `<span class="status-pill status-exception">⚠️ Výjimka</span>`
                                     : `<span class="status-pill status-pending">⏳ Čeká na zboží</span>`;

                         // Action buttons
                         const actionCell = isReady
                             ? `<div style="display:flex; gap:6px; flex-wrap:wrap;">
                                    <button class="btn-secondary btn-sm" onclick="event.stopPropagation(); window.appState.printLabel('${ord.orderId}')" title="Vytisknout přepravní štítek">🖨️ Štítek</button>
                                    <button class="btn-success btn-sm" onclick="event.stopPropagation(); window.appState.shipOrder('${ord.orderId}')">📦 Expedovat</button>
                                </div>`
                             : isShipped
                                 ? `<span class="text-label" style="color:var(--info-text);">✓ Odesláno</span>`
                                 : `<button class="btn-secondary btn-sm" onclick="event.stopPropagation(); window.openOrder('${ord.orderId}')">Detail →</button>`;

                         return `
                             <tr class="table-row-clickable" onclick="window.openOrder('${ord.orderId}')">
                                 <td><b>${ord.orderId}</b><br><small style="color: var(--text-subtle)">${ord.createdAt}</small></td>
                                 <td><b>${ord.customerName}</b></td>
                                 <td>${ord.items.map(it => `<div>${it.productName} &times; <b>${it.required} ks</b></div>`).join('')}</td>
                                 <td><span class="stock-badge-green">${totalStk} ks</span></td>
                                 <td><b>${totalStk + 5} ks</b> <small style="color: var(--text-subtle)">(volno ${Math.max(0, totalStk + 5 - totalReq)} ks)</small></td>
                                 <td>
                                     ${shortage > 0
                                         ? `<span class="shortage-badge-red" title="Tyto kusy nejsou na vlastním skladě a systém je objednává u dodavatele">Chybí ${shortage} ks</span>`
                                         : '<span class="stock-badge-green">0 ks (kompletní)</span>'}
                                 </td>
                                 <td><small style="font-weight: 600;">${ord.estimatedShipDate}</small></td>
                                 <td>${statusPill}</td>
                                 <td>${actionCell}</td>
                             </tr>
                         `;
                     }).join('') : '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--text-muted);">Žádné objednávky neodpovídají vyhledávání nebo filtru.</td></tr>'}
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
                        <h3 class="card-title">PO.ID} &MIDDOT; 🏢 ${PO.SUPPLIER}</h3>
                    </div>
                    <span class="status-pill ${po.status === 'RECEIVED' ? 'status-ready' : (po.status === 'SENT' ? 'status-info' : 'status-pending')}">
                        ${po.status === 'RECEIVED' ? 'Vše dorazilo a přiřazeno zákazníkům' : (po.status === 'SENT' ? 'Objednávka odeslána &middot; Čekáme na dodání' : 'Čeká na schválení')}
                    </span>
                </div>
                <div class="mb-3">
                    <p><b>Položky:</b> ${po.itemsCount} položek (${po.totalPcs} ks) &middot; <b>Předpokládané doručení:</b> ${po.eta}</p>
                    <p style="color: var(--text-muted); margin-top: 2px;"><b>Pro které zákazníky:</b> ${po.targetOrders}</p>
                    <p style="color: var(--text-muted); margin-top: 2px;"><b>Proč to objednáváme:</b> ${po.reason}</p>
                </div>
                <div class="card-actions">
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
                        <h3 class="card-title">ZÁSILKA Z NÁKUPU: ${PO.ID} &MIDDOT; ${PO.SUPPLIER}</h3>
                    </div>
                    <span class="status-pill ${po.status === 'RECEIVED' ? 'status-ready' : 'status-pending'}">
                        ${po.status === 'RECEIVED' ? '✓ Zboží přijato a přiřazeno' : 'Čeká na fyzické převzetí balíku'}
                    </span>
                </div>
                <div class="mb-3">
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
                        <h3 class="card-title">S.NAME}</h3>
                    </div>
                    <span class="status-pill status-ready">${s.priority}</span>
                </div>
                <div class="mb-2">
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
        <!-- FULFILLMENT ACTION BAR — only for ready orders -->
        ${isReady ? `
        <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #16a34a; border-radius: var(--radius-md); padding: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
            <div>
                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #15803d; margin-bottom: 4px;">✅ PŘIPRAVENO K EXPEDICI</div>
                <div style="font-size: 14px; font-weight: 700; color: #14532d;">Všechny položky jsou na skladě a přiřazeny. Objednávka čeká na zabalení a předání dopravci.</div>
                <div style="font-size: 12px; color: #166534; margin-top: 4px;">Expedice: <b>${order.estimatedShipDate}</b></div>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                <button class="btn-secondary btn-sm" style="background:#fff; border-color:#16a34a; color:#15803d; font-weight:700;" onclick="window.appState.printLabel('${order.orderId}')">
                    🖨️ Vytisknout štítek
                </button>
                <button class="btn-action-red btn-sm" style="background:#16a34a; border-color:#16a34a; font-size:13px; padding: 10px 20px;" onclick="window.appState.shipOrder('${order.orderId}')">
                    🚚 Expedovat — Předat dopravci
                </button>
            </div>
        </div>
        ` : order.status === 'SHIPPED' ? `
        <div style="background: #eff6ff; border: 2px solid #3b82f6; border-radius: var(--radius-md); padding: 16px; display: flex; align-items: center; gap: 16px;">
            <span style="font-size: 32px;">📦</span>
            <div>
                <div class="alert-title text-info-c">EXPEDOVÁNO</div>
                <div style="font-size: 14px; font-weight: 700; color: #1e3a8a;">${order.trackingInfo || 'Zásilka předána dopravci.'}</div>
                <div style="font-size: 12px; color: #1d4ed8; margin-top: 4px;">Dopravce: <b>${order.carrier || 'DPD'}</b> · Číslo zásilky: <b>${order.trackingNumber || '—'}</b></div>
            </div>
        </div>
        ` : `
        <div style="background: #fffbeb; border: 2px solid #f59e0b; border-radius: var(--radius-md); padding: 16px; display: flex; align-items: center; gap: 16px;">
            <span style="font-size: 28px;">⏳</span>
            <div>
                <div class="alert-title text-warning-c">ČEKÁ NA DOPLNĚNÍ SKLADU</div>
                <div style="color: #78350f;">Systém objednal chybějící zboží u dodavatele. Objednávku expedujete hned po doručení balíku.</div>
            </div>
        </div>
        `}

        <!-- Explicit Status Checklist -->
        <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px;">
            <h4 style="class="subsection-title"">
                PŘEHLED EXPEDICE & POLOŽEK
            </h4>
            <div class="grid-4">
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
                <span class="card-title"></span>
                <span class="story-title">PŘÍBĚH VYŘÍZENÍ OBJEDNÁVKY</span>
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
            <div class="alert-box alert-danger">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span class="card-title">⚠️</span>
                    <b style="font-size: 13px; text-transform: uppercase; color: var(--brand-red); letter-spacing: 0.05em;">PROBLÉM</b>
                </div>
                <p class="fw-bold text-danger-c mb-1">${order.problem.title}</p>
                <p class="text-sm text-danger-c mb-3">${order.problem.detail}</p>
                
                <div class="info-block mt-2">
                    <b style="font-size: 12px; color: var(--brand-red); text-transform: uppercase; display: block; margin-bottom: 4px;">CO SYSTÉM NAVRHUJE</b>
                    <p class="text-base">${order.problem.suggestion}</p>
                </div>

                <span class="alert-title">CO MŮŽETE UDĚLAT:</span>
                <div class="flex flex-wrap gap-2">
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
            <h4 class="subsection-title">POLOŽKY ZÁKAZNICKÉ OBJEDNÁVKY</h4>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Produkt</th>
                        <th>Objednáno</th>
                        <th>Alokováno</th>
                        <th>Celková fyzická zásoba skladu</th>
                        <th>Na cestě / Dorazilo</th>
                        <th>Přiřazeno k expedici</th>
                        <th>Stav položky</th>
                    </tr>
                </thead>
                <tbody>
                    ${order.items.map(it => {
                        const totalPhysicalStock = (it.stock || 0) + 5;
                        const freeStock = Math.max(0, totalPhysicalStock - it.required);
                        return `
                        <tr>
                            <td><b>${it.productName}</b><br><small style="color: var(--text-subtle)">Kód: ${it.sku}</small></td>
                            <td><b>${it.required} ks</b></td>
                            <td>${it.stock} ks</td>
                            <td><b>${totalPhysicalStock} ks</b> <small style="color: var(--text-subtle)">(volno ${freeStock} ks)</small></td>
                            <td>${it.received || it.stock} ks dorazilo / ${it.waiting || 0} ks na cestě</td>
                            <td><b style="color: var(--success-text)">${it.allocated} ks</b></td>
                            <td>
                                <span class="status-pill ${it.allocated >= it.required ? 'status-ready' : 'status-pending'}">
                                    ${it.allocated >= it.required ? '✓ Skladem & připraveno' : '⏳ Čeká na dodání'}
                                </span>
                            </td>
                        </tr>
                    `;}).join('')}
                </tbody>
            </table>
        </div>

        <!-- 3. Audit Trail -->
        <div>
            <h4 class="subsection-title">HISTORIE ROZHODNUTÍ A AUDIT</h4>
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

        <!-- 3.5 Order Notes -->
        <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px;">
            <h4 class="subsection-title">POZNÁMKY K OBJEDNÁVCE</h4>
            <div id="order-notes-list" style="margin-bottom: 10px; color: var(--text-muted);">
                ${order.notes && order.notes.length > 0 ? order.notes.map(n => `<div style="padding: 6px; background: var(--bg-subtle); border-radius: 4px; margin-bottom: 4px;"><b>E-shopař:</b> ${n}</div>`).join('') : 'Žádné poznámky.'}
            </div>
            <div style="display: flex; gap: 8px;">
                <input type="text" id="new-note-input" placeholder="Přidat poznámku k objednávce..." style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-size: 12px;">
                <button class="btn-action-red btn-sm" onclick="window.appState.addOrderNote('${order.orderId}')">Přidat</button>
            </div>
        </div>

        <!-- 4. Manual Overrides Center -->
        <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px;">
            <h4 style="font-size: 13px; font-weight: 800; color: var(--brand-red); text-transform: uppercase; margin-bottom: 10px;">
                Možnosti ručního zásahu (Ruční úpravy)
            </h4>
            <div class="flex flex-wrap gap-2">
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
                    <h3 class="card-title">S.NAME}</h3>
                </div>
                <span class="status-pill ${s.status === 'ACTIVE' ? 'status-ready' : 'status-pending'}">${s.statusLabel}</span>
            </div>
            <div class="card-meta-grid">
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
            <div class="card-meta-grid">
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
            <div class="card-actions">
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
                        <h3 class="product-main-title">PRODUCT.PRODUCTNAME}</h3>
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

    // Barcode scanner listener
    const scanInput = document.getElementById('barcode-scan-input');
    const scanBtn = document.getElementById('btn-process-scan');
    if (scanInput) {
        scanInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                window.appState.processBarcodeScan(scanInput.value);
                scanInput.value = '';
            }
        });
    }
    if (scanBtn && scanInput) {
        scanBtn.onclick = () => {
            window.appState.processBarcodeScan(scanInput.value);
            scanInput.value = '';
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

    // Order search and filters
    const orderSearchInput = document.getElementById('order-search-input');
    if (orderSearchInput) {
        orderSearchInput.addEventListener('input', () => {
            state.orderSearchQuery = orderSearchInput.value;
            state.render();
        });
    }

    const orderFilterButtons = document.querySelectorAll('#order-filters-container button');
    orderFilterButtons.forEach(btn => {
        btn.onclick = () => {
            orderFilterButtons.forEach(b => {
                b.style.background = '#ffffff';
                b.style.color = 'var(--text-main)';
                b.style.borderColor = 'var(--border-color)';
                b.classList.remove('active-filter');
            });
            btn.style.background = 'var(--brand-red)';
            btn.style.color = 'white';
            btn.style.borderColor = 'var(--brand-red)';
            btn.classList.add('active-filter');

            const filterVal = btn.getAttribute('data-filter');
            state.orderFilter = filterVal;
            state.render();
        };
    });

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
        dashboard: { eyebrow: 'PŘEHLED', title: 'Autonomní nákup & dostupnost' },
        availability: { eyebrow: 'DOSTUPNOST & DEFICIT', title: 'Analýza nedostatku zboží a navrhovaná řešení' },
        orders: { eyebrow: 'OBJEDNÁVKY', title: 'Stav a detail objednávek' },
        procurement: { eyebrow: 'NÁKUP', title: 'Nákupní objednávky u dodavatelů' },
        receiving: { eyebrow: 'PŘÍJEM', title: 'Příjem zboží & Naskladnění' },
        suppliers: { eyebrow: 'DODAVATELÉ', title: 'Správa dodavatelů' },
        products: { eyebrow: 'PRODUKTY', title: 'Produkty & Mapování na dodavatele' },
        settings: { eyebrow: 'NASTAVENÍ', title: 'Nastavení nákupních pravidel' },
        feeds: { eyebrow: 'FEEDY', title: 'Datové feedy od dodavatelů' },
        carriers: { eyebrow: 'DOPRAVCI', title: 'Přepravní služby' },
        rules: { eyebrow: 'PRAVIDLA', title: 'Automatizační pravidla' },
        audit: { eyebrow: 'AUDIT', title: 'Kompletní protokol systému' },
    };

    const t = titles[viewName] || titles.dashboard;
    document.getElementById('view-eyebrow').textContent = t.eyebrow;
    document.getElementById('view-title').textContent = t.title;

    // Trigger view-specific rendering
    if (viewName === 'products') renderProductsCatalog(state, '');
    if (viewName === 'suppliers') renderSuppliersManagement(state);
    if (viewName === 'availability') renderAvailabilityView(state);
    if (viewName === 'audit') renderFullAuditView(state);
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

// Seed initial system audit trail so audit view is not empty on first open
state.data.globalAuditTrail = [
    {
        id: 'AUDIT-INIT-004', timestamp: '12:02', targetType: 'SUPPLIER_SELECTION', targetId: 'OBJ-2026-001246',
        originalValue: 'Helikon-Tex (4 ks) — chybí 2 ks',
        newValue: 'Helikon-Tex 4 ks + Brandit CZ 2 ks (split nákup)',
        reason: 'Žádný dodavatel nemá celé požadované množství. AIE použil strategii SPLIT_BALANCED.',
        user: 'SYSTÉM',
    },
    {
        id: 'AUDIT-INIT-003', timestamp: '12:01', targetType: 'ALLOCATION', targetId: 'OBJ-2026-001246',
        originalValue: 'Žádná alokace',
        newValue: 'Čeká na dodání 6 ks (Helikon-Tex + Brandit CZ)',
        reason: 'Zákazník objednal 6 ks Elastického obinadla. Na vlastním skladě 0 ks.',
        user: 'SYSTÉM',
    },
    {
        id: 'AUDIT-INIT-002', timestamp: '11:14', targetType: 'GOODS_RECEIPT', targetId: 'NÁKUP-2026-08-001',
        originalValue: 'Čeká na doručení (Fox Outdoor, 12 ks)',
        newValue: 'Přijato 12 ks — automaticky přiřazeno k OBJ-2026-001245',
        reason: 'Balík od Fox Outdoor dorazil. Automatická alokace k čekajícím objednávkám.',
        user: 'SYSTÉM',
    },
    {
        id: 'AUDIT-INIT-001', timestamp: '10:31', targetType: 'SUPPLIER_SELECTION', targetId: 'OBJ-2026-001245',
        originalValue: 'Žádný dodavatel — chybí 2 ks',
        newValue: 'Fox Outdoor (hlavní partner, 2 ks, doručení do 24h)',
        reason: 'Fox Outdoor vybrán jako hlavní partner s nejnižší cenou a nejkratší dodací lhůtou.',
        user: 'SYSTÉM',
    },
];

state.data.procurementSettings = { defaultStrategy: 'SPLIT_BALANCED', allowMultiSupplierSplit: true, requireApproval: true };

// Expose product catalog renderer globally for search
window.renderProductsCatalog = () => {
    const searchInput = document.getElementById('product-search-input');
    renderProductsCatalog(state, searchInput ? searchInput.value : '');
};

// ============================================================
// AVAILABILITY VIEW RENDERER
// Renders deficit analysis derived from customerOrders
// ============================================================
function renderAvailabilityView(app) {
    // 1. Deficity — already rendered by renderApp into #full-exceptions-list
    // 2. Availability breakdown per order with deficit
    const deficitOrders = app.data.customerOrders.filter(ord => {
        const totalReq = ord.items.reduce((s, i) => s + i.required, 0);
        const totalStk = ord.items.reduce((s, i) => s + i.stock, 0);
        return totalReq > totalStk;
    });

    // Also rerender full-exceptions-list in context
    const excEl = document.getElementById('full-exceptions-list');
    if (excEl) {
        const excContent = app.data.exceptions.length > 0
            ? app.data.exceptions.map(exc => `
                <div class="item-card" style="border-left: 4px solid var(--brand-red); margin-bottom: 16px;">
                    <div class="item-card-header">
                        <div>
                            <span class="item-tag" style="color: var(--brand-red)">VÝJIMKA ${exc.id}</span>
                            <h3 class="card-title">EXC.TYPE}</h3>
                        </div>
                        <span class="status-pill status-exception">Závažnost: ${exc.severity}</span>
                    </div>
                    <div class="mb-3">
                        <p style="margin-bottom: 6px;"><b>Popis:</b> ${exc.detail}</p>
                        <p style="margin-bottom: 6px; color: var(--text-muted);"><b>Proč vznikl:</b> ${exc.cause}</p>
                        <div class="alert-box alert-danger mt-2">
                            <span class="alert-title">Co systém navrhuje:</span>
                            <p class="alert-body">${exc.suggestion}</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
                        <button class="btn-action-red btn-sm" onclick="window.appState.resolveException('${exc.id}')">✓ Použít návrh systému</button>
                        <button class="btn-secondary btn-sm" onclick="window.appState.resolveException('${exc.id}')">Vyřešit ručně</button>
                    </div>
                </div>`).join('')
            : `<div style="padding:24px; text-align:center;">
                    <span style="font-size:32px;">✅</span>
                    <p style="color: var(--success-text); font-weight: 700; margin-top:8px;">Žádné výjimky. Vše běží v pořádku.</p>
                    <p style="color: var(--text-muted); font-size:12px; margin-top:4px;">
                        Systém průběžně monitoruje stav skladu a automaticky vytváří nákupy, pokud detekuje deficit.
                    </p>
               </div>`;

        // Add deficit orders section if any
        const deficitSection = deficitOrders.length > 0 ? `
            <h4 style="font-size: 13px; font-weight: 800; color: var(--text-main); text-transform: uppercase; letter-spacing: 0.05em; margin: 20px 0 10px;">
                🔍 Detailní pohled na deficity v zákaznických objednávkách
            </h4>
            ${deficitOrders.map(ord => {
                const mappingsForOrder = (app.data.mappings || []).filter(m =>
                    ord.items.some(it => it.sku === m.eshopSku)
                );
                return `
                    <div class="item-card" style="margin-bottom: 12px; border-left: 3px solid #f59e0b;">
                        <div class="item-card-header">
                            <div>
                                <span class="item-tag">DEFICIT</span>
                                <b style="font-size:14px;">${ord.orderId}</b>
                                <span style="font-size:12px; color:var(--text-subtle); margin-left:8px;">${ord.customerName}</span>
                            </div>
                            <button class="btn-secondary btn-sm" onclick="window.openOrder('${ord.orderId}')">Detail objednávky →</button>
                        </div>
                        ${ord.items.map(it => {
                            const shortage = Math.max(0, it.required - it.stock);
                            const suppliers = mappingsForOrder.filter(m => m.eshopSku === it.sku && m.active);
                            return shortage > 0 ? `
                                <div style="background:var(--bg-subtle); border-radius:var(--radius-sm); padding:10px; margin-top:8px; font-size:12px;">
                                    <b>${it.productName}</b>
                                    <span class="shortage-badge-red" style="margin-left:8px;">Chybí ${shortage} ks</span>
                                    <span class="stock-badge-green" style="margin-left:4px;">Skladem: ${it.stock} ks</span>
                                    ${suppliers.length > 0 ? `
                                        <div style="margin-top:6px; color:var(--text-muted);">
                                            <b>Dostupní dodavatelé pro doplnění:</b>
                                            ${suppliers.map(s => `<span style="margin-left:6px;">🏢 ${s.supplierName} (${s.supplierStock} ks, ${s.leadTimeDays}d, ${s.purchasePriceCzk} Kč/ks)</span>`).join(' ·')}
                                        </div>` : '<div style="color:var(--danger-text); margin-top:4px;">⚠️ Žádný aktivní dodavatel pro tuto položku!</div>'}
                                </div>` : '';
                        }).join('')}
                        ${ord.procurement.length > 0 ? `
                            <div style="margin-top:8px; font-size:12px; color:var(--info-text);">
                                <b>🛒 Systém objednal:</b>
                                ${ord.procurement.map(p => `${p.supplier} (${p.quantity} ks, ETA: ${p.eta})`).join(' + ')}
                            </div>` : ''}
                    </div>`;
            }).join('')}` : '';

        excEl.innerHTML = excContent + deficitSection;
    }

    // Render interventions audit into #interventions-audit-list (availability decision log)
    renderAuditTrail(app);
}

// ============================================================
// FULL AUDIT VIEW RENDERER (renders into #audit-list)
// ============================================================
function renderFullAuditView(app) {
    const el = document.getElementById('audit-list');
    if (!el) return;

    // Collect all audit events: global + per-order
    const allEvents = [];
    (app.data.globalAuditTrail || []).forEach(r => {
        allEvents.push({ ...r, source: 'global' });
    });
    app.data.customerOrders.forEach(ord => {
        (ord.auditTrail || []).forEach(a => {
            allEvents.push({
                id: `ord-${ord.orderId}-${a.time}`,
                timestamp: a.time,
                targetType: a.actor === 'USER' ? 'MANUAL_OVERRIDE' : 'SYSTEM_ACTION',
                targetId: ord.orderId,
                originalValue: '',
                newValue: a.action,
                reason: a.actor === 'USER' ? 'Ruční zásah e-shopaře' : 'Automatické rozhodnutí systému AIE',
                user: a.actor === 'USER' ? 'E-shopař' : 'SYSTÉM',
                source: 'order',
            });
        });
    });

    if (allEvents.length === 0) {
        el.innerHTML = '<p style="color: var(--text-subtle); padding: 16px; font-size: 13px;">Zatím žádné záznamy. Spusťte demo cyklus nebo proveďte ruční zásah.</p>';
        return;
    }

    el.innerHTML = `
        <table class="data-table" style="font-size:12px;">
            <thead>
                <tr>
                    <th>Čas</th>
                    <th>Typ</th>
                    <th>Čeho se týká</th>
                    <th>Co se stalo / Nová hodnota</th>
                    <th>Důvod rozhodnutí</th>
                    <th>Provedl</th>
                </tr>
            </thead>
            <tbody>
                ${allEvents.map(r => `
                    <tr>
                        <td style="font-family: monospace; color: var(--text-subtle); white-space:nowrap;">${r.timestamp}</td>
                        <td>
                            <span class="${r.user === 'SYSTÉM' ? 'status-pill status-info' : 'manual-override-badge'}">
                                ${r.targetType === 'SUPPLIER_SELECTION' ? '🤖 Výběr dodavatele'
                                    : r.targetType === 'GOODS_RECEIPT' ? '📥 Příjem zboží'
                                    : r.targetType === 'ALLOCATION' ? '🔗 Alokace'
                                    : r.targetType === 'MANUAL_OVERRIDE' ? '✋ Ruční zásah'
                                    : '⚙️ Systémová akce'}
                            </span>
                        </td>
                        <td><b>${r.targetId}</b></td>
                        <td style="max-width:240px;">${r.newValue}</td>
                        <td style="color: var(--text-muted); max-width:200px;">${r.reason}</td>
                        <td><span style="font-size:11px;">👤 ${r.user}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}



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

// Modal close button for other modals
const modalCloseIds = ['feed-modal', 'carrier-modal', 'rule-modal'];
modalCloseIds.forEach(id => {
    const el = document.getElementById(id);
    const btn = document.getElementById(`${id}-close-btn`);
    if (btn) btn.onclick = () => el.classList.remove('active');
    if (el) el.onclick = (e) => { if (e.target === el) el.classList.remove('active'); };
});

// Wire dynamic dialog buttons
const btnAddFeed = document.getElementById('btn-add-feed-dialog');
if (btnAddFeed) btnAddFeed.onclick = () => window.openFeedWizard();

const btnAddCarrier = document.getElementById('btn-add-carrier-dialog');
if (btnAddCarrier) btnAddCarrier.onclick = () => window.openCarrierDialog();

const btnAddRule = document.getElementById('btn-add-rule-dialog');
if (btnAddRule) btnAddRule.onclick = () => window.openRuleDialog();

// Reset & guided demo
document.getElementById('btn-reset-demo').onclick = () => state.reset();
document.getElementById('btn-sim-cycle').onclick = () => state.runGuidedDemoCycle();

// Init
setupNavigation();
state.render();

// ============================================================
// WIZARDS & DIALOGS IMPLEMENTATION
// ============================================================
window.openFeedWizard = () => {
    const modal = document.getElementById('feed-modal');
    const body = document.getElementById('feed-modal-body');
    
    let step = 1;
    let feedData = { name: '', url: '', type: 'XML', encoding: 'UTF-8' };
    
    function renderWizardStep() {
        if (step === 1) {
            body.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <span style="font-size: 11px; font-weight: 700; color: var(--brand-red);">KROK 1/4: IDENTIFIKACE FEEDU</span>
                    <h4 class="card-title">Zadejte základní údaje o feedu dodavatele</h4>
                    <p style="font-size: 12px; color: var(--text-subtle);">Zadejte název zdroje a URL adresu XML nebo CSV souboru.</p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px;">Název feedu (Dodavatel):</label>
                        <input type="text" id="feed-name-input" value="${feedData.name}" placeholder="Např. Fox Outdoor Hlavní Feed" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px;">URL adresa feedu:</label>
                        <input type="text" id="feed-url-input" value="${feedData.url}" placeholder="https://api.supplier.cz/feeds/catalog.xml" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px;">Typ souboru:</label>
                            <select id="feed-type-select" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
                                <option value="XML" ${feedData.type === 'XML' ? 'selected' : ''}>Heureka XML / Shoptet XML</option>
                                <option value="CSV" ${feedData.type === 'CSV' ? 'selected' : ''}>Standardní CSV</option>
                                <option value="JSON" ${feedData.type === 'JSON' ? 'selected' : ''}>REST API JSON</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px;">Kódování:</label>
                            <select id="feed-encoding-select" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
                                <option value="UTF-8" ${feedData.encoding === 'UTF-8' ? 'selected' : ''}>UTF-8</option>
                                <option value="WINDOWS-1250" ${feedData.encoding === 'WINDOWS-1250' ? 'selected' : ''}>Windows-1250</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <button class="btn-secondary" onclick="document.getElementById('feed-modal').classList.remove('active')">Zrušit</button>
                    <button class="btn-action-red" id="btn-feed-next-1">Pokračovat k mapování &rarr;</button>
                </div>
            `;
            
            document.getElementById('btn-feed-next-1').onclick = () => {
                const name = document.getElementById('feed-name-input').value;
                const url = document.getElementById('feed-url-input').value;
                const type = document.getElementById('feed-type-select').value;
                const enc = document.getElementById('feed-encoding-select').value;
                if (!name || !url) {
                    alert('Vyplňte prosím název i URL adresu feedu.');
                    return;
                }
                feedData = { name, url, type, encoding: enc };
                step = 2;
                renderWizardStep();
            };
        } else if (step === 2) {
            body.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <span style="font-size: 11px; font-weight: 700; color: var(--brand-red);">KROK 2/4: MAPOVÁNÍ DATOVÝCH POLÍ</span>
                    <h4 class="card-title">Přiřaďte sloupce z feedu na AIE datové entity</h4>
                    <p style="font-size: 12px; color: var(--text-subtle);">Zvolte, které elementy feedu odpovídají kódům produktů, cenám a stavu skladu.</p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; background: var(--bg-subtle); padding: 12px; border-radius: 6px;">
                        <div><b>AIE Pole systému</b></div>
                        <div><b>Element ve feedu dodavatele</b></div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; align-items: center;">
                        <div><b>Kód produktu (SKU / EAN):</b></div>
                        <select class="map-select" style="padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
                            <option value="ITEM_ID">CODE / ITEM_ID</option>
                            <option value="PRODUCTNO">PRODUCTNO</option>
                            <option value="EAN">EAN</option>
                        </select>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; align-items: center;">
                        <div><b>Nákupní cena bez DPH:</b></div>
                        <select class="map-select" style="padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
                            <option value="PRICE_VAT">PRICE_EX_VAT</option>
                            <option value="PRICE">PRICE</option>
                            <option value="PURCHASE_PRICE">PURCHASE_PRICE</option>
                        </select>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; align-items: center;">
                        <div><b>Počet kusů skladem:</b></div>
                        <select class="map-select" style="padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
                            <option value="STOCK">STOCK / AMOUNT</option>
                            <option value="AVAILABILITY">AVAILABILITY</option>
                        </select>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <button class="btn-secondary" id="btn-feed-prev-2">&larr; Zpět</button>
                    <button class="btn-action-red" id="btn-feed-next-2">Validovat zdroj &rarr;</button>
                </div>
            `;
            
            document.getElementById('btn-feed-prev-2').onclick = () => { step = 1; renderWizardStep(); };
            document.getElementById('btn-feed-next-2').onclick = () => {
                step = 3;
                renderWizardStep();
            };
        } else if (step === 3) {
            body.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <span style="font-size: 11px; font-weight: 700; color: var(--brand-red);">KROK 3/4: VALIDACE DATOVÝCH STRUKTUR</span>
                    <h4 class="card-title">Simulace stažení a validace struktury feedu</h4>
                    <p style="font-size: 12px; color: var(--text-subtle);">Systém zkušebně načetl feed a zkontroloval datové typy.</p>
                </div>
                <div style="background: #f0fdf4; border: 1px solid #bdf0c4; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                    <b style="color: #166534; display: block; margin-bottom: 8px;">✓ Spojení úspěšně navázáno</b>
                    <ul style="font-size: 13px; color: #166534; padding-left: 20px; line-height: 1.5;">
                        <li>Načteno celkem: <b>152 produktů</b></li>
                        <li>Spárováno se sortimentem: <b>98 % položek</b></li>
                        <li>Chybná data: <b>0 položek</b></li>
                        <li>Průměrná nákupní cena: <b>240 CZK</b></li>
                    </ul>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <button class="btn-secondary" id="btn-feed-prev-3">&larr; Zpět</button>
                    <button class="btn-action-red" id="btn-feed-next-3">Aktivovat feed &rarr;</button>
                </div>
            `;
            
            document.getElementById('btn-feed-prev-3').onclick = () => { step = 2; renderWizardStep(); };
            document.getElementById('btn-feed-next-3').onclick = () => {
                step = 4;
                renderWizardStep();
            };
        } else if (step === 4) {
            body.innerHTML = `
                <div style="margin-bottom: 15px;">
                    <span style="font-size: 11px; font-weight: 700; color: var(--success-text);">KROK 4/4: DATOVÝ ZDROJ JE AKTIVNÍ</span>
                    <h4 class="card-title">Feed byl úspěšně připojen a aktivován</h4>
                    <p style="font-size: 12px; color: var(--text-subtle);">Položky z feedu se nyní pravidelně aktualizují každou hodinu.</p>
                </div>
                <div style="background: var(--bg-subtle); padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <p><b>Název zdroje:</b> ${feedData.name}</p>
                    <p><b>URL:</b> <code>${feedData.url}</code></p>
                    <p><b>Stav synchronizace:</b> Aktivní &middot; Čeká na další běh za 59 minut</p>
                </div>
                <div style="display: flex; justify-content: flex-end; border-top: 1px solid var(--border-color); padding-top: 15px;">
                    <button class="btn-action-red" id="btn-feed-finish">Dokončit</button>
                </div>
            `;
            
            document.getElementById('btn-feed-finish').onclick = () => {
                modal.classList.remove('active');
                
                const feedsList = document.getElementById('feeds-list');
                if (feedsList) {
                    feedsList.innerHTML = `
                        <div class="item-card" style="border-left: 3px solid var(--success-text);">
                            <div class="item-card-header">
                                <div>
                                    <span class="item-tag">AKTIVNÍ DATOVÝ ZDROJ (FEED)</span>
                                    <h3 class="card-title">FEEDDATA.NAME}</h3>
                                </div>
                                <span class="status-pill status-ready">Pravidelný import</span>
                            </div>
                            <div class="mb-2">
                                <p><b>Zdrojová URL:</b> <code>${feedData.url}</code></p>
                                <p><b>Kódování:</b> ${feedData.encoding} &middot; <b>Typ:</b> ${feedData.type} &middot; <b>Frekvence:</b> Každou hodinu</p>
                                <p style="color: var(--success-text); margin-top: 4px; font-weight: 600;">✓ Poslední import proběhl před minutou. Načteno 152 položek.</p>
                            </div>
                        </div>
                    `;
                }
                showToast(`Feed „${feedData.name}" byl úspěšně nastaven a spuštěn.`, 'success');
            };
        }
    }
    
    renderWizardStep();
    modal.classList.add('active');
};

window.openCarrierDialog = () => {
    const modal = document.getElementById('carrier-modal');
    const body = document.getElementById('carrier-modal-body');
    
    body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
            <div>
                <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px;">Název přepravce:</label>
                <input type="text" id="carrier-name" placeholder="Např. Zásilkovna / DPD / PPL" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
            </div>
            <div>
                <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px;">Služba / Způsob dopravy:</label>
                <input type="text" id="carrier-service" placeholder="Doručení na adresu / Výdejní místa" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
            </div>
            <div>
                <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px;">API klíč pro sledování (Tracking):</label>
                <input type="text" placeholder="Zadejte tajný token přepravce" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
            </div>
        </div>
        <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 15px;">
            <button class="btn-secondary" onclick="document.getElementById('carrier-modal').classList.remove('active')">Zrušit</button>
            <button class="btn-action-red" id="btn-save-carrier">✓ Uložit dopravce</button>
        </div>
    `;
    
    document.getElementById('btn-save-carrier').onclick = () => {
        const name = document.getElementById('carrier-name').value;
        const svc = document.getElementById('carrier-service').value;
        if (!name || !svc) {
            alert('Vyplňte prosím název i službu.');
            return;
        }
        modal.classList.remove('active');
        
        const list = document.getElementById('carriers-list');
        if (list) {
            list.innerHTML = `
                <div class="item-card" style="border-left: 3px solid var(--success-text);">
                    <div class="item-card-header">
                        <div>
                            <span class="item-tag">PŘIPOJENÝ DOPRAVCE</span>
                            <h3 class="card-title">NAME}</h3>
                        </div>
                        <span class="status-pill status-ready">API Propojeno</span>
                    </div>
                    <div class="mb-2">
                        <p><b>Služba:</b> ${svc}</p>
                        <p><b>Sledování zásilek:</b> Aktivní &middot; Systém stahuje stavy doručení automaticky ze Shoptetu.</p>
                        <p style="color: var(--text-muted); font-size: 11px;"><b>Vazba na objednávky:</b> OBJ-2026-001245 expedována přes tuto službu.</p>
                    </div>
                </div>
            `;
        }
        showToast(`Dopravce „${name}" byl úspěšně připojen.`, 'success');
    };
    
    modal.classList.add('active');
};

window.openRuleDialog = () => {
    const modal = document.getElementById('rule-modal');
    const body = document.getElementById('rule-modal-body');
    
    body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
            <div>
                <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px;">Název pravidla:</label>
                <input type="text" id="rule-name" placeholder="Např. Limit pro schvalování drahých nákupů" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
            </div>
            <div>
                <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px;">Podmínka pravidla (Kdy se pravidlo spustí):</label>
                <select id="rule-condition" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
                    <option value="PRICE_OVER_10K">Nákupní objednávka je vyšší než 10 000 Kč</option>
                    <option value="SUPPLIER_FAIL">Hlavní dodavatel má výpadek dodávky (lead-time zpoždění > 3 dny)</option>
                    <option value="CUSTOMER_WAITING">Zákazník čeká déle než 5 dnů</option>
                </select>
            </div>
            <div>
                <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px;">Akce systému (Co AIE udělá):</label>
                <select id="rule-action" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
                    <option value="PAUSE_AND_ASK">Pozastavit automatické odeslání a vyžádat schválení</option>
                    <option value="SWITCH_SUPPLIER">Automaticky přehodit na záložního nejrychlejšího partnera</option>
                    <option value="EMAIL_ALERT">Poslat e-mailové upozornění manažerovi nákupu</option>
                </select>
            </div>
        </div>
        <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 15px;">
            <button class="btn-secondary" onclick="document.getElementById('rule-modal').classList.remove('active')">Zrušit</button>
            <button class="btn-action-red" id="btn-save-rule">✓ Vytvořit pravidlo</button>
        </div>
    `;
    
    document.getElementById('btn-save-rule').onclick = () => {
        const name = document.getElementById('rule-name').value;
        const cond = document.getElementById('rule-condition').options[document.getElementById('rule-condition').selectedIndex].text;
        const act = document.getElementById('rule-action').options[document.getElementById('rule-action').selectedIndex].text;
        if (!name) {
            alert('Vyplňte prosím název pravidla.');
            return;
        }
        modal.classList.remove('active');
        
        const list = document.getElementById('rules-list');
        if (list) {
            list.innerHTML = `
                <div class="item-card" style="border-left: 3px solid var(--brand-red);">
                    <div class="item-card-header">
                        <div>
                            <span class="item-tag">AKTIVNÍ AUTOMATIZAČNÍ PRAVIDLO</span>
                            <h3 class="card-title">NAME}</h3>
                        </div>
                        <span class="status-pill status-ready">Spouští se</span>
                    </div>
                    <div class="mb-2">
                        <p><b>Podmínka:</b> ${cond}</p>
                        <p><b>Akce:</b> ${act}</p>
                        <p style="color: var(--text-muted); font-size: 11px;"><b>Vliv na rozhodnutí:</b> AIE toto pravidlo aplikuje při každém cyklu plánování.</p>
                    </div>
                </div>
            `;
        }
        showToast(`Pravidlo „${name}" bylo uloženo a zavedeno do AIE.`, 'success');
    };
    modal.classList.add('active');
};

