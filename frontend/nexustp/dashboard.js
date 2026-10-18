import { buildAppShell } from './app-shell.js';
import { getViewMeta, UI_GUIDE, UI_LABELS } from './ui-config.js';

// --- Security: output encoding for all dynamic values rendered via innerHTML ---
function esc(value) {
    return String(value ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
}
// Safe JS string literal for use inside inline event-handler attributes (onclick="fn(${jsArg(x)})").
function jsArg(value) {
    return esc(JSON.stringify(String(value ?? '')));
}

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
            customerName: 'Jan Novák',
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
            customerName: 'Petra Dvořáková',
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
            customerName: 'Karel Vlček',
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
            customerName: 'Martina Malá',
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
    pickupSchedules: [
        { id: 'PICKUP-001', carrier: 'Zásilkovna / Packeta', integration: 'Nativní přímé API napojení', pickupTime: '14:30', status: 'Automatika aktivní', autoEnabled: true, packagesWaiting: 18 },
        { id: 'PICKUP-002', carrier: 'DPD CZ (Balíkobot)', integration: 'Balíkobot / Chameleoon API', pickupTime: '16:00', status: 'Automatika aktivní', autoEnabled: true, packagesWaiting: 24 },
        { id: 'PICKUP-003', carrier: 'PPL CZ (GO Balík)', integration: 'GO Balík univerzální konektor', pickupTime: '17:15', status: 'Automatika aktivní', autoEnabled: true, packagesWaiting: 12 },
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

    overrideOrderQuantity(orderId, newQtyStr) {
        const ord = this.data.customerOrders.find(o => o.orderId === orderId);
        if (!ord) return;
        const newQty = parseInt(newQtyStr, 10);
        if (isNaN(newQty) || newQty < 0) return;

        if (ord.items.length > 0) {
            const item = ord.items[0];
            const oldQty = item.required;
            item.required = newQty;

            // Recalculate allocation & status
            if (item.stock >= newQty) {
                item.allocated = newQty;
                item.waiting = 0;
                ord.status = 'READY_TO_FULFILL';
                ord.estimatedShipDate = 'Dnes do 17:00 (ihned k expedici)';
            } else {
                item.allocated = item.stock;
                item.waiting = newQty - item.stock;
                ord.status = 'WAITING_FOR_STOCK';
                ord.estimatedShipDate = '30. srpna (po doručení od dodavatelů)';
            }

            ord.auditTrail.unshift({
                time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
                actor: 'USER',
                action: `Ruční úprava požadovaného množství z ${oldQty} ks na ${newQty} ks.`
            });

            this.addToGlobalAudit({
                targetType: 'ORDER_QUANTITY',
                targetId: item.sku,
                orderId: orderId,
                originalValue: `${oldQty} ks`,
                newValue: `${newQty} ks`,
                reason: 'E-shopař ručně upravil požadované množství.',
                user: 'E-shopař'
            });

            this.render();
            if (this.selectedOrder && this.selectedOrder.orderId === orderId) {
                this.selectedOrder = ord;
                openOrderDetailModal(ord);
            }
            showToast(`Množství u objednávky ${orderId} bylo upraveno na ${newQty} ks a stav přepočítán.`, 'success');
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
                <html><head><title>Štítek & Balicí list — ${orderId}</title>
                <style>
                    body{font-family:sans-serif;padding:15px;background:#fff;color:#000;} 
                    .box{border:3px solid #000;padding:16px;border-radius:8px;} 
                    .big{font-size:26px;font-weight:900;text-transform:uppercase;} 
                    .barcode{font-size:28px;font-family:monospace;letter-spacing:2px;margin:10px 0;background:#f1f5f9;padding:6px;text-align:center;} 
                    .picklist{margin-top:14px;border-top:2px dashed #000;padding-top:10px;background:#fafafa;padding:10px;border-radius:6px;}
                    .picklist-header{font-size:12px;font-weight:900;text-transform:uppercase;margin-bottom:6px;}
                    .picklist-item{font-size:13px;font-weight:700;margin-bottom:4px;}
                    hr{border-color:#000;}
                </style>
                </head><body>
                <div class="box">
                    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;">
                        <span>DOPRAVCE: ${carrier}</span>
                        <span>OBJEDNÁVKA: ${orderId}</span>
                    </div>
                    <hr/>
                    <div class="big">${carrier}</div>
                    <div class="barcode">||||| ${tracking} |||||</div>
                    <div><b>Příjemce:</b> ${esc(ord.customerName)}</div>
                    
                    <!-- BALICÍ SOUPISKA (PICKLIST) PŘÍMO NA ŠTÍTKU -->
                    <div class="picklist">
                        <div class="picklist-header">📦 BALICÍ SOUPISKA (KDE ZBOŽÍ NAJÍT VE SKLADĚ):</div>
                        ${ord.items.map(i => `<div class="picklist-item">▪ <b>${esc(i.required)}x</b> ${esc(i.productName)} <span style="background:#e0f2fe;color:#0369a1;padding:1px 5px;border-radius:4px;font-size:11px;">📍 Regál A-${(i.sku.charCodeAt(0)%15)+1}/P-${(i.sku.length%4)+1}</span></div>`).join('')}
                    </div>
                    <div style="margin-top:10px;font-size:10px;color:#666;text-align:center;">AIE 2.0 Operational Shipping Label</div>
                </div>
                <script>window.print();<\/script>
                </body></html>`);
            labelWindow.document.close();
        }
        showToast(`🖨️ Tiskový štítek vygenerován pro ${orderId} (${carrier} · ${tracking})`, 'info');
    }

    bulkShipReadyOrders() {
        const readyOrders = this.data.customerOrders.filter(o => o.status === 'READY_TO_FULFILL' || o.status === 'READY_TO_SHIP');
        if (readyOrders.length === 0) {
            showToast('Žádné objednávky nečekají na expedici.', 'warning');
            return;
        }
        readyOrders.forEach(ord => {
            ord.status = 'SHIPPED';
            ord.carrier = 'DPD';
            ord.trackingNumber = `DPD-${Date.now().toString().slice(-8)}`;
            ord.estimatedShipDate = 'Expedováno';
            ord.auditTrail.unshift({
                time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
                actor: 'USER',
                action: 'Hromadná expedice: Zásilka předána dopravci DPD.',
                user: 'E-shopař',
            });
        });
        showToast(`📦 Hromadně expedováno ${readyOrders.length} objednávek!`, 'success');
        this.render();
    }

    bulkPrintLabels() {
        const readyOrders = this.data.customerOrders.filter(o => o.status === 'READY_TO_FULFILL' || o.status === 'READY_TO_SHIP' || o.status === 'SHIPPED');
        if (readyOrders.length === 0) {
            showToast('Žádné štítky k tisku.', 'warning');
            return;
        }
        const labelWindow = window.open('', '_blank', 'width=500,height=600');
        if (labelWindow) {
            labelWindow.document.write(`
                <html><head><title>Hromadný tisk štítků (${esc(readyOrders.length)})</title></head>
                <body style="font-family:sans-serif; padding:20px;">
                    <h2>Hromadný tisk přepravních štítků (${esc(readyOrders.length)} ks)</h2>
                    ${readyOrders.map(o => `
                        <div style="border:2px solid #000; padding:15px; margin-bottom:15px; page-break-after:always;">
                            <h3>PŘEPRAVNÍ ŠTÍTEK - ${o.carrier || 'DPD'}</h3>
                            <p><b>Příjemce:</b> ${esc(o.customerName)}</p>
                            <p><b>Objednávka:</b> ${esc(o.orderId)}</p>
                            <p><b>Tracking:</b> ${o.trackingNumber || 'DPD-LABEL-BULK'}</p>
                        </div>
                    `).join('')}
                    <script>window.print();<\/script>
                </body></html>
            `);
        }
        showToast(`🖨️ Vygenerováno ${readyOrders.length} štítků pro hromadný tisk.`, 'info');
    }

    startInventoryMode() {
        const sku = prompt('📷 Pípněte EAN / SKU kód produktu pro inventurní korekci:', 'TRIKO-BASIC-BLK-M');
        if (!sku) return;
        const newCountStr = prompt(`Zadejte nový naměřený počet kusů na skladě pro SKU '${sku}':`, '5');
        if (!newCountStr || isNaN(parseInt(newCountStr, 10))) return;
        const newCount = parseInt(newCountStr, 10);

        // Update own stock in customer order items with matching SKU
        let updatedCount = 0;
        this.data.customerOrders.forEach(ord => {
            ord.items.forEach(it => {
                if (it.sku.toUpperCase() === sku.trim().toUpperCase()) {
                    it.stock = newCount;
                    updatedCount++;
                }
            });
        });

        this.addToGlobalAudit({
            targetType: 'GOODS_RECEIPT',
            targetId: sku.trim().toUpperCase(),
            originalValue: 'Inventura před korekcí',
            newValue: `Fyzicky naměřeno ${newCount} ks`,
            reason: 'Fyzická inventura skladu e-shopu',
            user: 'Skladník (Inventura)',
        });

        showToast(`📋 Inventura provedena: SKU ${sku.trim().toUpperCase()} nastaveno na ${newCount} ks.`, 'success');
        this.render();
    }

    bulkApprovePOs() {
        const pendingPOs = this.data.purchaseOrders.filter(p => p.status === 'PENDING_APPROVAL');
        if (pendingPOs.length === 0) {
            showToast('Žádné nákupní objednávky nečekají na schválení.', 'warning');
            return;
        }
        pendingPOs.forEach(po => {
            po.status = 'SENT';
        });
        showToast(`⚡ Hromadně schváleno a odesláno ${pendingPOs.length} nákupních objednávek!`, 'success');
        this.render();
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
        <div class="pending-batch-card">
            <b class="pending-batch-title">
                ${esc(pendingPOs.length)} nákupy čekají na vaše schválení
            </b>
            <p class="pending-batch-desc">
                Systém je automaticky připravil podle dostupnosti zboží a vybraných dodavatelů. Po schválení je odešle dodavatelům.
            </p>
            <button class="btn-action-red btn-sm w-full" onclick="window.appState.approveAllPOs()">
                ✓ Schválit všechny (${esc(pendingPOs.length)}) a odeslat dodavatelům
            </button>
            <span class="pending-batch-hint">
                Po schválení budou nákupy předány dodavatelům a systém začne hlídat termín doručení.
            </span>
        </div>
        ${pendingPOs.map(po => `
            <div class="item-card">
                <div class="item-card-header">
                    <div class="item-id-wrap">
                        <span class="item-tag">NÁKUP U DODAVATELE</span>
                        <span class="item-id">${esc(po.id)}</span>
                    </div>
                    <span class="status-pill status-pending">Čeká na schválení</span>
                </div>
                <div class="item-detail-text">
                    <b>🏢 Dodavatel: ${esc(po.supplier)}</b> &middot; ${esc(po.itemsCount)} položky (celkem ${esc(po.totalPcs)} ks)<br>
                    <small style="color: var(--text-subtle)"><b>Pro koho:</b> ${esc(po.targetOrders)}<br><b>Doručení:</b> ${esc(po.eta)}</small>
                </div>
                <div class="item-action-area">
                    <button class="btn-action-red btn-sm" onclick="window.appState.approvePO(${jsArg(po.id)})">
                        ✓ Schválit nákup u ${esc(po.supplier)}
                    </button>
                    <span class="action-hint-text">Schválením potvrdíte objednání tohoto zboží u dodavatele.</span>
                </div>
            </div>
        `).join('')}
    ` : `<div class="empty-state">${UI_LABELS.empty.pendingAll}</div>`;

    // 4. Dashboard Column 2: Exceptions
    const exceptionsListEl = document.getElementById('exceptions-list');
    exceptionsListEl.innerHTML = d.exceptions.length > 0 ? d.exceptions.map(exc => `
        <div class="item-card item-card--danger">
            <div class="item-card-header">
                <div class="item-id-wrap">
                    <span class="item-tag item-tag--danger">VYŽADUJE ROZHODNUTÍ</span>
                    <span class="item-id">${esc(exc.id)}</span>
                </div>
                <span class="status-pill status-exception">${esc(exc.severity)}</span>
            </div>
            <div class="item-detail-text">
                <b class="text-danger">${esc(exc.type)}</b><br>
                <span>${esc(exc.detail)}</span>
            </div>
            <div class="item-action-area">
                <button class="btn-action-red btn-sm" onclick="window.appState.resolveException(${jsArg(exc.id)})">
                    🔍 Zvolit náhradníka / Korigovat deficit
                </button>
                <span class="action-hint-text">Předá položku k přepočtu s alternativním dodavatelem.</span>
            </div>
        </div>
    `).join('') : `<div class="empty-state empty-state--success">${UI_LABELS.empty.exceptionsNone}</div>`;

    // 5. Dashboard Column 3: Ready to ship
    const readyListEl = document.getElementById('ready-list');
    readyListEl.innerHTML = readyOrders.length > 0 ? readyOrders.map(ord => `
        <div class="item-card item-card--success clickable-card" onclick="window.openOrder(${jsArg(ord.orderId)})">
            <div class="item-card-header">
                <div class="item-id-wrap">
                    <span class="item-tag item-tag--success">100% SKLADEM & SPÁROVÁNO</span>
                    <span class="item-id">${esc(ord.orderId)}</span>
                </div>
                <span class="status-pill status-ready">Připraveno k vyřízení</span>
            </div>
            <div class="item-detail-text">
                <b>👤 ${esc(ord.customerName)}</b><br>
                <span>${ord.items.map(it => `${esc(it.productName)} (${esc(it.required)} ks)`).join(', ')}</span><br>
                <small class="text-success" style="font-weight:700;">Expedice: ${esc(ord.estimatedShipDate)}</small>
            </div>
            <div class="item-action-area">
                <button class="btn-secondary btn-sm" onclick="event.stopPropagation(); window.appState.printLabel(${jsArg(ord.orderId)})" title="Vytisknout přepravní štítek">
                    🖨️ Vytisknout štítek
                </button>
                <button class="btn-action-red btn-sm" onclick="event.stopPropagation(); window.appState.shipOrder(${jsArg(ord.orderId)})" class="btn-success">
                    📦 Expedovat
                </button>
            </div>
        </div>
    `).join('') : `<div class="empty-state">${UI_LABELS.empty.readyNone}</div>`;

    // 6. View: Full Exceptions List
    const fullExcEl = document.getElementById('full-exceptions-list');
    if (fullExcEl) {
        fullExcEl.innerHTML = d.exceptions.length > 0 ? d.exceptions.map(exc => `
            <div class="item-card item-card--danger mb-3">
                <div class="item-card-header">
                    <div>
                        <span class="item-tag item-tag--danger">VÝJIMKA ${esc(exc.id)}</span>
                        <h3 class="card-title">${esc(exc.type)}</h3>
                    </div>
                    <span class="status-pill status-exception">Závažnost: ${esc(exc.severity)}</span>
                </div>
                <div class="mb-3">
                    <p class="mb-2"><b>Popis problému:</b> ${esc(exc.detail)}</p>
                    <p class="mb-2 text-muted"><b>Proč vznikl:</b> ${esc(exc.cause)}</p>
                    <div class="alert-box alert-danger mt-2">
                        <span class="alert-title">Co systém navrhuje:</span>
                        <p class="alert-body">${esc(exc.suggestion)}</p>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="btn-action-red btn-sm" onclick="window.appState.resolveException(${jsArg(exc.id)})">
                        ✓ Použít návrh systému (Zvolit náhradníka)
                    </button>
                    <button class="btn-secondary btn-sm" onclick="window.appState.resolveException(${jsArg(exc.id)})">
                        Korigovat množství
                    </button>
                    <button class="btn-secondary btn-sm" onclick="window.appState.resolveException(${jsArg(exc.id)})">
                        Vyřešit ručně
                    </button>
                </div>
            </div>
        `).join('') : `<p class="empty-state empty-state--success">${UI_LABELS.empty.exceptionsResolved}</p>`;
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
                                    <button class="btn-secondary btn-sm" onclick="event.stopPropagation(); window.appState.printLabel(${jsArg(ord.orderId)})" title="Vytisknout přepravní štítek">🖨️ Štítek</button>
                                    <button class="btn-success btn-sm" onclick="event.stopPropagation(); window.appState.shipOrder(${jsArg(ord.orderId)})">📦 Expedovat</button>
                                </div>`
                             : isShipped
                                 ? `<span class="text-label" style="color:var(--info-text);">✓ Odesláno</span>`
                                 : `<button class="btn-secondary btn-sm" onclick="event.stopPropagation(); window.openOrder(${jsArg(ord.orderId)})">Detail →</button>`;

                         return `
                             <tr class="table-row-clickable" onclick="window.openOrder(${jsArg(ord.orderId)})">
                                 <td><b>${esc(ord.orderId)}</b><br><small style="color: var(--text-subtle)">${esc(ord.createdAt)}</small></td>
                                 <td><b>${esc(ord.customerName)}</b></td>
                                 <td>${ord.items.map(it => `
                                     <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                         <img src="https://placehold.co/36x36/e2e8f0/0f172a?text=${encodeURIComponent(it.sku.slice(0,3))}" alt="${esc(it.productName)}" style="width:36px; height:36px; border-radius:4px; object-fit:cover; border:1px solid var(--border-color);" />
                                         <div><b>${esc(it.productName)}</b> &times; <b>${esc(it.required)} ks</b></div>
                                     </div>
                                 `).join('')}</td>
                                 <td><span class="stock-badge-green">${totalStk} ks</span></td>
                                 <td><b>${totalStk + 5} ks</b> <small style="color: var(--text-subtle)">(volno ${Math.max(0, totalStk + 5 - totalReq)} ks)</small></td>
                                 <td>
                                     ${shortage > 0
                                         ? `<span class="shortage-badge-red" title="Tyto kusy nejsou na vlastním skladě a systém je objednává u dodavatele">Chybí ${shortage} ks</span>`
                                         : '<span class="stock-badge-green">0 ks (kompletní)</span>'}
                                 </td>
                                 <td><small style="font-weight: 600;">${esc(ord.estimatedShipDate)}</small></td>
                                 <td>${statusPill}</td>
                                 <td>${actionCell}</td>
                             </tr>
                         `;
                     }).join('') : `<tr><td colspan="9" class="empty-state">${UI_LABELS.empty.ordersNoMatch}</td></tr>`}
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
                        <h3 class="card-title">${esc(po.id)} &middot; 🏢 ${esc(po.supplier)}</h3>
                    </div>
                    <span class="status-pill ${po.status === 'RECEIVED' ? 'status-ready' : (po.status === 'SENT' ? 'status-info' : 'status-pending')}">
                        ${po.status === 'RECEIVED' ? 'Vše dorazilo a přiřazeno zákazníkům' : (po.status === 'SENT' ? 'Objednávka odeslána &middot; Čekáme na dodání' : 'Čeká na schválení')}
                    </span>
                </div>
                <div class="mb-3">
                    <p><b>Položky:</b> ${esc(po.itemsCount)} položek (${esc(po.totalPcs)} ks) &middot; <b>Předpokládané doručení:</b> ${esc(po.eta)}</p>
                    <p style="color: var(--text-muted); margin-top: 2px;"><b>Pro které zákazníky:</b> ${esc(po.targetOrders)}</p>
                    <p style="color: var(--text-muted); margin-top: 2px;"><b>Proč to objednáváme:</b> ${esc(po.reason)}</p>
                </div>
                <div class="card-actions">
                    ${po.status === 'PENDING_APPROVAL' ? `
                        <button class="btn-action-red btn-sm" onclick="window.appState.approvePO(${jsArg(po.id)})">
                            ✓ Schválit nákup u ${esc(po.supplier)}
                        </button>
                    ` : ''}
                    ${po.status === 'SENT' ? `
                        <button class="btn-action-red btn-sm" onclick="window.appState.receiveGoods(${jsArg(po.id)})">
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
                        <h3 class="card-title">ZÁSILKA Z NÁKUPU: ${esc(po.id)} &middot; ${esc(po.supplier)}</h3>
                    </div>
                    <span class="status-pill ${po.status === 'RECEIVED' ? 'status-ready' : 'status-pending'}">
                        ${po.status === 'RECEIVED' ? '✓ Zboží přijato a přiřazeno' : 'Čeká na fyzické převzetí balíku'}
                    </span>
                </div>
                <div class="mb-3">
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: var(--bg-subtle); padding: 10px; border-radius: var(--radius-sm); margin-bottom: 8px;">
                        <div>
                            <span style="color: var(--text-subtle); display: block; font-size: 11px;">Co jsme objednali:</span>
                            <b>${esc(po.totalPcs)} ks</b>
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
                        <b>Přiřazení:</b> Systém přiřadí zboží automaticky podle pořadí zákaznických objednávek (${esc(po.targetOrders)}).
                    </p>
                </div>
                ${po.status !== 'RECEIVED' ? `
                    <button class="btn-action-red btn-sm" onclick="window.appState.receiveGoods(${jsArg(po.id)})">
                        📥 Potvrdit příjem balíku & Automaticky přiřadit k objednávkám
                    </button>
                ` : `
                    <span style="color: var(--success-text); font-weight: 700; font-size: 12px;">
                        ✓ ${esc(po.totalPcs)} ks bylo přijato a automaticky přiřazeno k čekajícím zákaznickým objednávkám.
                    </span>
                `}
            </div>
        `).join('');
    }

    // 10. View: Suppliers — delegated to dedicated renderer
    if (document.getElementById('suppliers-list') && state.currentView === 'suppliers') {
        renderSuppliersManagement(app);
    }
}

// Open Order Detail Modal — luxury split-panel layout
function openOrderDetailModal(order) {
    state.selectedOrder = order;
    const modal = document.getElementById('order-modal');
    const titleEl = document.getElementById('modal-order-title');
    const customerEl = document.getElementById('modal-order-customer');
    const statusEl = document.getElementById('modal-order-status');
    const body = document.getElementById('modal-body');
    const footer = document.getElementById('modal-footer');

    const statusMeta = getStatusMeta(order.status, order.status === 'EXCEPTION');
    const totalRequired = order.items.reduce((sum, it) => sum + it.required, 0);
    const totalStock = order.items.reduce((sum, it) => sum + it.stock, 0);
    const shortage = Math.max(0, totalRequired - totalStock);
    const isReady = order.status === 'READY_TO_FULFILL' || order.status === 'READY_TO_SHIP';
    const isShipped = order.status === 'SHIPPED';

    titleEl.textContent = order.orderId;
    customerEl.textContent = order.customerName;
    statusEl.innerHTML = `<span class="status-pill ${statusMeta.class}">${statusMeta.label}</span>`;

    let heroClass = 'order-hero--waiting';
    let heroLabel = 'ČEKÁ NA DOPLNĚNÍ';
    let heroText = 'Systém objednal chybějící zboží u dodavatele. Expedice proběhne po doručení na sklad.';
    let heroMeta = `Termín vyřízení: ${esc(order.estimatedShipDate)}`;
    let heroActions = '';

    if (isReady) {
        heroClass = 'order-hero--ready';
        heroLabel = 'PŘIPRAVENO K EXPEDICI';
        heroText = 'Všechny položky jsou na skladě a přiřazeny. Objednávka čeká na zabalení.';
        heroMeta = `Expedice: ${esc(order.estimatedShipDate)}`;
        heroActions = `
            <div class="order-hero-actions">
                <button class="btn-secondary btn-sm" onclick="window.appState.printLabel(${jsArg(order.orderId)})">Vytisknout štítek</button>
                <button class="btn-success btn-sm" onclick="window.appState.shipOrder(${jsArg(order.orderId)})">Expedovat</button>
            </div>`;
    } else if (isShipped) {
        heroClass = 'order-hero--shipped';
        heroLabel = 'EXPEDOVÁNO';
        heroText = order.trackingInfo || 'Zásilka byla předána dopravci.';
        heroMeta = `Dopravce: ${order.carrier || '—'} · Sledování: ${order.trackingNumber || '—'}`;
    } else if (order.problem) {
        heroClass = 'order-hero--danger';
        heroLabel = 'VYŽADUJE ROZHODNUTÍ';
        heroText = order.problem.title;
        heroMeta = order.problem.detail;
    }

    const storySteps = [
        { n: 1, text: `Zákazník <b>${esc(order.customerName)}</b> objednal <b>${totalRequired} ks</b> zboží.` },
        { n: 2, text: shortage > 0
            ? `Na skladě <b>${totalStock} ks</b>. Chybí <b>${shortage} ks</b> — systém objednává u dodavatele.`
            : `Na skladě <b>${totalStock} ks</b>. Vše je kompletně skladem.` },
        { n: 3, text: order.procurement.length > 0
            ? order.procurement.map(p => `<b>${esc(p.supplier)}</b> (${esc(p.quantity)} ks · ${esc(p.status)})`).join(' · ')
            : 'Nákup u dodavatele nebyl nutný — vše bylo skladem.' },
        { n: 4, text: isReady
            ? 'Objednávka je připravena k zabalení a expedici.'
            : 'Po doručení zboží systém automaticky přiřadí položky k objednávce.' },
    ];

    body.innerHTML = `
        <div class="order-hero ${heroClass}">
            <div>
                <div class="order-hero-label">${heroLabel}</div>
                <p class="order-hero-text">${heroText}</p>
                <p class="order-hero-meta">${heroMeta}</p>
            </div>
            ${heroActions}
        </div>

        <div class="order-status-strip">
            <div class="order-stat">
                <span class="order-stat-label">Objednáno</span>
                <span class="order-stat-value">${totalRequired} ks</span>
            </div>
            <div class="order-stat">
                <span class="order-stat-label">Na skladě</span>
                <span class="order-stat-value order-stat-value--success">${totalStock} ks</span>
            </div>
            <div class="order-stat">
                <span class="order-stat-label">Chybí</span>
                <span class="order-stat-value ${shortage > 0 ? 'order-stat-value--danger' : 'order-stat-value--success'}">${shortage} ks</span>
            </div>
            <div class="order-stat">
                <span class="order-stat-label">Termín</span>
                <span class="order-stat-value order-stat-value--sm">${esc(order.estimatedShipDate)}</span>
            </div>
        </div>

        ${order.problem ? `
        <div class="order-panel">
            <div class="order-panel-head"><span class="order-panel-title">Problém & návrh systému</span></div>
            <div class="order-problem">
                <p class="order-problem-title">${esc(order.problem.title)}</p>
                <p class="order-problem-detail">${esc(order.problem.detail)}</p>
                <div class="info-block">${esc(order.problem.suggestion)}</div>
                <div class="order-problem-actions">
                    <button class="btn-action-red btn-sm" onclick="window.appState.confirmSplitProposal(${jsArg(order.orderId)})">Potvrdit návrh</button>
                    <button class="btn-secondary btn-sm" onclick="const q=prompt('Nové množství:','6');if(q)window.appState.overrideOrderQuantity(${jsArg(order.orderId)},q)">Upravit množství</button>
                    <button class="btn-secondary btn-sm" onclick="const s=prompt('Jiný dodavatel:','Brandit CZ');if(s)window.appState.overrideOrderSupplier(${jsArg(order.orderId)},s)">Změnit dodavatele</button>
                </div>
            </div>
        </div>` : ''}

        <div class="order-layout">
            <div class="order-layout-main">
                <div class="order-panel">
                    <div class="order-panel-head"><span class="order-panel-title">Položky objednávky</span></div>
                    <div class="order-items">
                        ${order.items.map(it => {
                            const totalPhysical = (it.stock || 0) + 5;
                            const bin = it.binLocation || `A-${(it.sku.charCodeAt(0) % 15) + 1}/P-${(it.sku.length % 4) + 1}`;
                            const ready = it.allocated >= it.required;
                            return `
                            <div class="order-item">
                                <div class="order-item-top">
                                    <img class="product-thumb" src="https://placehold.co/48x48/e2e8f0/0f172a?text=${encodeURIComponent(it.sku.slice(0,2))}" alt="">
                                    <div class="order-item-info">
                                        <span class="order-item-name">${esc(it.productName)}</span>
                                        <span class="order-item-sku">${esc(it.sku)} · ${bin}</span>
                                    </div>
                                    <span class="status-pill ${ready ? 'status-ready' : 'status-pending'}">${ready ? 'Skladem' : 'Čeká'}</span>
                                </div>
                                <div class="order-item-grid">
                                    <div class="order-item-cell">
                                        <span class="order-item-cell-label">Objednáno</span>
                                        <span class="order-item-cell-value">${esc(it.required)}</span>
                                    </div>
                                    <div class="order-item-cell">
                                        <span class="order-item-cell-label">Alokováno</span>
                                        <span class="order-item-cell-value">${esc(it.allocated)}</span>
                                    </div>
                                    <div class="order-item-cell">
                                        <span class="order-item-cell-label">Zásoba</span>
                                        <span class="order-item-cell-value">${totalPhysical}</span>
                                    </div>
                                    <div class="order-item-cell">
                                        <span class="order-item-cell-label">Na cestě</span>
                                        <span class="order-item-cell-value">${it.waiting || 0}</span>
                                    </div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>

                <div class="order-panel">
                    <div class="order-panel-head"><span class="order-panel-title">Historie & audit</span></div>
                    <div class="order-timeline">
                        ${order.auditTrail.map(a => `
                            <div class="timeline-entry timeline-entry--${a.actor === 'USER' ? 'user' : 'system'}">
                                <div class="timeline-dot"></div>
                                <div>
                                    <time class="timeline-time">${esc(a.time)}</time>
                                    <p class="timeline-text">${a.actor === 'USER' ? '<span class="manual-override-badge">Ruční zásah</span> ' : ''}${esc(a.action)}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <aside class="order-layout-aside">
                <div class="order-panel">
                    <div class="order-panel-head"><span class="order-panel-title">Průběh vyřízení</span></div>
                    <div class="order-story">
                        ${storySteps.map(s => `
                            <div class="story-step">
                                <div class="story-step-num">${esc(s.n)}</div>
                                <p class="story-step-text">${s.text}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="order-panel">
                    <div class="order-panel-head"><span class="order-panel-title">Poznámky</span></div>
                    <div class="order-notes-panel">
                        <div class="order-notes-list" id="order-notes-list">
                            ${order.notes && order.notes.length > 0
                                ? order.notes.map(n => `<div class="note-item"><b>E-shopař:</b> ${n}</div>`).join('')
                                : '<span class="order-notes-empty">Žádné poznámky.</span>'}
                        </div>
                        <div class="note-input-row">
                            <input type="text" id="new-note-input" class="form-input" placeholder="Přidat poznámku...">
                            <button class="btn-action-red btn-sm" onclick="window.appState.addOrderNote(${jsArg(order.orderId)})">Přidat</button>
                        </div>
                    </div>
                </div>

                <div class="order-panel">
                    <div class="order-panel-head"><span class="order-panel-title">Fotodokumentace balení</span></div>
                    <div class="order-photo-grid">
                        <div class="order-photo-cell">
                            <img src="https://placehold.co/200x150/e2e8f0/64748b?text=Balení" alt="Foto balení">
                            <span class="photo-timestamp">14:32:05</span>
                        </div>
                        <div class="order-photo-cell">
                            <img src="https://placehold.co/200x150/e2e8f0/64748b?text=Obsah" alt="Foto obsah">
                            <span class="photo-timestamp">14:32:18</span>
                        </div>
                        <div class="order-photo-cell order-photo-cell--empty">
                            <span class="order-photo-cell-label">Stanice A1</span>
                        </div>
                    </div>
                </div>
            </aside>
        </div>
    `;

    footer.innerHTML = `
        <span class="order-modal-customer">${esc(order.createdAt)}</span>
        <div class="order-modal-footer-actions">
            <button class="btn-secondary btn-sm" onclick="window.appState.generateMultiPackLabels(${jsArg(order.orderId)})">Více balíků</button>
            <button class="btn-secondary btn-sm" onclick="window.appState.printAdditionalLabel(${jsArg(order.orderId)})">Dodatečný štítek</button>
            <button class="btn-secondary btn-sm" onclick="const s=prompt('Nový dodavatel:','Brandit CZ');if(s)window.appState.overrideOrderSupplier(${jsArg(order.orderId)},s)">Změnit dodavatele</button>
            <button class="btn-secondary btn-sm" onclick="const q=prompt('Nové množství:','10');if(q)window.appState.overrideOrderQuantity(${jsArg(order.orderId)},q)">Upravit množství</button>
            <button class="btn-action-red btn-sm" onclick="window.appState.receiveGoods('NÁKUP-2026-08-001')">Naskladnit</button>
        </div>
    `;

    document.body.style.overflow = 'hidden';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

// ============================================================
// CONFIG MODAL — dodavatelé, mapování, svozy
// ============================================================

function openConfigModal() {
    const modal = document.getElementById('config-modal');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeConfigModal() {
    const modal = document.getElementById('config-modal');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function setConfigModalHeader(eyebrow, title) {
    document.getElementById('config-modal-eyebrow').textContent = eyebrow;
    document.getElementById('config-modal-title').textContent = title;
}

function setConfigModalFooter(cancelFn, saveLabel, saveFn) {
    const footer = document.getElementById('config-modal-footer');
    footer.innerHTML = `
        <span class="config-hint" style="border:none;background:transparent;padding:0;flex:1;">Všechna pole jsou okamžitě aplikována po uložení.</span>
        <div class="order-modal-footer-actions">
            <button class="btn-secondary btn-sm" id="config-modal-cancel">Zrušit</button>
            <button class="btn-action-red btn-sm" id="config-modal-save">${saveLabel}</button>
        </div>
    `;
    document.getElementById('config-modal-cancel').onclick = cancelFn;
    document.getElementById('config-modal-save').onclick = saveFn;
}

window.openSupplierEditor = function(supplierId) {
    const isNew = !supplierId;
    const s = isNew ? null : state.data.suppliers.find(x => x.id === supplierId);
    setConfigModalHeader('DODAVATELÉ', isNew ? 'NOVÝ DODAVATEL' : `UPRAVIT — ${s.name.toUpperCase()}`);

    const body = document.getElementById('config-modal-body');
    body.innerHTML = `
        <form class="config-form" id="supplier-edit-form">
            <div class="config-form-grid">
                <div class="config-field config-field--full">
                    <label for="sup-name">Název dodavatele</label>
                    <input type="text" id="sup-name" required value="${s ? s.name : ''}" placeholder="např. Fox Outdoor">
                </div>
                <div class="config-field config-field--full">
                    <label for="sup-category">Sortiment / kategorie</label>
                    <input type="text" id="sup-category" value="${s ? s.categoryDescription : ''}" placeholder="Textil, outdoor, taktické vybavení...">
                </div>
                <div class="config-field">
                    <label for="sup-lead-days">Dodací lhůta (dny)</label>
                    <input type="number" id="sup-lead-days" min="1" max="30" value="${s ? s.leadTimeDays : 3}">
                </div>
                <div class="config-field">
                    <label for="sup-lead-label">Popis dodací lhůty</label>
                    <input type="text" id="sup-lead-label" value="${s ? s.leadTimeLabel : '3 pracovní dny'}">
                </div>
                <div class="config-field">
                    <label for="sup-min-order">Minimální nákup (Kč)</label>
                    <input type="number" id="sup-min-order" min="0" step="100" value="${s ? s.minOrderAmountCzk : 0}">
                </div>
                <div class="config-field">
                    <label for="sup-order-method">Způsob objednání</label>
                    <select id="sup-order-method">
                        ${['XML feed + e-mail', 'CSV ceník + e-mail', 'E-mail s tabulkou', 'B2B portál', 'API integrace'].map(m =>
                            `<option value="${m}" ${s && s.orderMethod === m ? 'selected' : ''}>${m}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="config-field">
                    <label for="sup-status">Stav partnerství</label>
                    <select id="sup-status">
                        <option value="ACTIVE" ${s && s.status === 'ACTIVE' ? 'selected' : ''}>Aktivní partner</option>
                        <option value="PAUSED" ${s && s.status === 'PAUSED' ? 'selected' : ''}>Pozastaveno</option>
                    </select>
                </div>
                <div class="config-field">
                    <label for="sup-priority">Priorita (pořadí)</label>
                    <input type="number" id="sup-priority" min="1" max="99" value="${s ? s.priority : state.data.suppliers.length + 1}">
                </div>
                <div class="config-field config-field--full">
                    <label for="sup-note">Interní poznámka</label>
                    <textarea id="sup-note" placeholder="Doplňující informace o partnerovi...">${s ? (s.note || '') : ''}</textarea>
                </div>
            </div>
        </form>
    `;

    setConfigModalFooter(closeConfigModal, 'Uložit dodavatele', () => {
        const name = document.getElementById('sup-name').value.trim();
        if (!name) { showToast('Název dodavatele je povinný.', 'danger'); return; }

        const minOrder = Number(document.getElementById('sup-min-order').value) || 0;
        const status = document.getElementById('sup-status').value;
        const payload = {
            name,
            categoryDescription: document.getElementById('sup-category').value.trim() || '—',
            leadTimeDays: Number(document.getElementById('sup-lead-days').value) || 3,
            leadTimeLabel: document.getElementById('sup-lead-label').value.trim() || '3 dny',
            minOrderAmountCzk: minOrder,
            minOrderLabel: minOrder > 0 ? `Min. ${minOrder.toLocaleString('cs-CZ')} Kč` : 'Bez limitu (0 Kč)',
            orderMethod: document.getElementById('sup-order-method').value,
            status,
            statusLabel: status === 'ACTIVE' ? 'Aktivní partner' : 'Pozastaveno',
            priority: Number(document.getElementById('sup-priority').value) || 1,
            note: document.getElementById('sup-note').value.trim(),
        };

        if (isNew) {
            state.data.suppliers.push({
                id: `SUP-${Date.now()}`,
                ...payload,
                lastCatalogSync: 'Zatím nebyla synchronizována nabídka',
                mappedProductsCount: 0,
            });
            showToast(`Dodavatel „${name}" byl přidán.`, 'success');
        } else {
            Object.assign(s, payload);
            showToast(`Dodavatel „${name}" byl aktualizován.`, 'success');
        }

        state.data.suppliers.sort((a, b) => a.priority - b.priority);
        closeConfigModal();
        renderSuppliersManagement(state);
    });

    openConfigModal();
};

window.openMappingEditor = function(mappingId, productId, variantId) {
    const isNew = !mappingId;
    const m = isNew ? null : (state.data.mappings || []).find(x => x.id === mappingId);
    const suppliers = state.data.suppliers.filter(s => s.status === 'ACTIVE');
    const existingVariant = isNew
        ? (state.data.mappings || []).find(x => x.productId === productId && x.variantId === variantId)
        : m;

    setConfigModalHeader('PRODUKTY & MAPOVÁNÍ', isNew ? 'NOVÉ PROPOJENÍ NA DODAVATELE' : 'UPRAVIT MAPOVÁNÍ');

    const body = document.getElementById('config-modal-body');
    body.innerHTML = `
        <form class="config-form" id="mapping-edit-form">
            <div class="config-hint">
                ${isNew
                    ? `Varianta: <b>${existingVariant ? existingVariant.variantName : variantId}</b> · E-shop SKU: <b>${existingVariant ? existingVariant.eshopSku : '—'}</b>`
                    : `Produkt: <b>${esc(m.productName)}</b> · Varianta: <b>${esc(m.variantName)}</b> · SKU: <b>${esc(m.eshopSku)}</b>`}
            </div>
            <div class="config-form-grid">
                <div class="config-field config-field--full">
                    <label for="map-supplier">Dodavatel</label>
                    <select id="map-supplier" required>
                        ${suppliers.map(s =>
                            `<option value="${esc(s.name)}" data-id="${esc(s.id)}" ${m && m.supplierName === s.name ? 'selected' : ''}>${esc(s.name)}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="config-field">
                    <label for="map-supplier-sku">Dodavatelský kód (SKU)</label>
                    <input type="text" id="map-supplier-sku" required value="${m ? m.supplierSku : ''}" placeholder="FOX-TSHIRT-BLK-M">
                </div>
                <div class="config-field">
                    <label for="map-price">Nákupní cena (Kč/ks)</label>
                    <input type="number" id="map-price" min="0" step="1" value="${m ? m.purchasePriceCzk : 100}">
                </div>
                <div class="config-field">
                    <label for="map-stock">Skladem u partnera (ks)</label>
                    <input type="number" id="map-stock" min="0" value="${m ? m.supplierStock : 0}">
                </div>
                <div class="config-field">
                    <label for="map-lead">Dodací lhůta (dny)</label>
                    <input type="number" id="map-lead" min="1" max="30" value="${m ? m.leadTimeDays : 3}">
                </div>
                <div class="config-field">
                    <label for="map-priority">Priorita u varianty</label>
                    <input type="number" id="map-priority" min="1" max="10" value="${m ? m.priority : ((state.data.mappings || []).filter(x => x.variantId === variantId).length + 1)}">
                </div>
                <div class="config-field">
                    <label for="map-active">Stav mapování</label>
                    <select id="map-active">
                        <option value="true" ${!m || m.active ? 'selected' : ''}>Aktivní</option>
                        <option value="false" ${m && !m.active ? 'selected' : ''}>Neaktivní</option>
                    </select>
                </div>
            </div>
        </form>
    `;

    setConfigModalFooter(closeConfigModal, 'Uložit mapování', () => {
        const supplierSelect = document.getElementById('map-supplier');
        const supplierName = supplierSelect.value;
        const supplierId = supplierSelect.selectedOptions[0].dataset.id;
        const supplierSku = document.getElementById('map-supplier-sku').value.trim();
        if (!supplierSku) { showToast('Dodavatelský SKU je povinný.', 'danger'); return; }

        const mappingData = {
            supplierId,
            supplierName,
            supplierSku,
            purchasePriceCzk: Number(document.getElementById('map-price').value) || 0,
            supplierStock: Number(document.getElementById('map-stock').value) || 0,
            leadTimeDays: Number(document.getElementById('map-lead').value) || 3,
            priority: Number(document.getElementById('map-priority').value) || 1,
            active: document.getElementById('map-active').value === 'true',
        };

        if (isNew) {
            const newMapping = {
                id: `MAP-${Date.now()}`,
                productId,
                productName: existingVariant.productName,
                variantId,
                variantName: existingVariant.variantName,
                eshopSku: existingVariant.eshopSku,
                ...mappingData,
            };
            if (!state.data.mappings) state.data.mappings = [];
            state.data.mappings.push(newMapping);
            showToast(`Mapování ${existingVariant.eshopSku} → ${supplierName} bylo vytvořeno.`, 'success');
        } else {
            Object.assign(m, mappingData);
            showToast(`Mapování ${m.eshopSku} → ${supplierName} bylo aktualizováno.`, 'success');
        }

        closeConfigModal();
        const searchVal = document.getElementById('product-search-input')?.value || '';
        renderProductsCatalog(state, searchVal);
    });

    openConfigModal();
};

window.openPickupEditor = function(pickupId) {
    const p = state.data.pickupSchedules.find(x => x.id === pickupId);
    if (!p) return;

    setConfigModalHeader('SVOZY DOPRAVCŮ', `UPRAVIT — ${p.carrier.toUpperCase()}`);

    const body = document.getElementById('config-modal-body');
    body.innerHTML = `
        <form class="config-form" id="pickup-edit-form">
            <div class="config-form-grid">
                <div class="config-field config-field--full">
                    <label for="pick-carrier">Dopravce</label>
                    <input type="text" id="pick-carrier" required value="${esc(p.carrier)}">
                </div>
                <div class="config-field config-field--full">
                    <label for="pick-integration">Typ integrace / API</label>
                    <input type="text" id="pick-integration" value="${esc(p.integration)}">
                </div>
                <div class="config-field">
                    <label for="pick-time">Čas automatického svozu</label>
                    <input type="time" id="pick-time" required value="${esc(p.pickupTime)}">
                </div>
                <div class="config-field">
                    <label for="pick-packages">Balíků ke svozu</label>
                    <input type="number" id="pick-packages" min="0" value="${esc(p.packagesWaiting)}">
                </div>
                <div class="config-field">
                    <label for="pick-auto">Automatické objednání svozu</label>
                    <select id="pick-auto">
                        <option value="true" ${p.autoEnabled ? 'selected' : ''}>Zapnuto</option>
                        <option value="false" ${!p.autoEnabled ? 'selected' : ''}>Vypnuto</option>
                    </select>
                </div>
                <div class="config-field">
                    <label for="pick-status">Stav</label>
                    <input type="text" id="pick-status" value="${esc(p.status)}">
                </div>
            </div>
        </form>
    `;

    setConfigModalFooter(closeConfigModal, 'Uložit svoz', () => {
        p.carrier = document.getElementById('pick-carrier').value.trim();
        p.integration = document.getElementById('pick-integration').value.trim();
        p.pickupTime = document.getElementById('pick-time').value;
        p.packagesWaiting = Number(document.getElementById('pick-packages').value) || 0;
        p.autoEnabled = document.getElementById('pick-auto').value === 'true';
        p.status = document.getElementById('pick-status').value.trim() || (p.autoEnabled ? 'Automatika aktivní' : 'Automatika vypnuta');

        closeConfigModal();
        renderPickupsScheduleView(state);
        showToast(`Svoz pro ${p.carrier} byl uložen (${p.pickupTime}).`, 'success');
    });

    openConfigModal();
};

// ============================================================
// SUPPLIER MANAGEMENT VIEW RENDERING
// ============================================================
function renderSuppliersManagement(app) {
    const suppliersEl = document.getElementById('suppliers-list');
    if (!suppliersEl) return;
    const suppliers = app.data.suppliers;

    suppliersEl.innerHTML = suppliers.map((s, idx) => `
        <div class="item-card">
            <div class="item-card-header">
                <div>
                    <span class="item-tag">PARTNER č. ${esc(s.priority)} · ${s.statusLabel.toUpperCase()}</span>
                    <h3 class="card-title">${esc(s.name)}</h3>
                </div>
                <span class="status-pill ${s.status === 'ACTIVE' ? 'status-ready' : 'status-pending'}">${esc(s.statusLabel)}</span>
            </div>
            <div class="card-meta-grid">
                <div class="meta-item">
                    <span class="meta-label">Co od něj nakupujeme</span>
                    <span class="meta-value">${esc(s.categoryDescription)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Dodací lhůta</span>
                    <span class="meta-value">${esc(s.leadTimeLabel)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Způsob objednání</span>
                    <span class="meta-value">${esc(s.orderMethod)}</span>
                </div>
            </div>
            <div class="card-meta-grid">
                <div class="meta-item">
                    <span class="meta-label">Minimální nákup</span>
                    <span class="meta-value">${esc(s.minOrderLabel)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Propojených produktů</span>
                    <span class="meta-value">${esc(s.mappedProductsCount)} variant</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Poslední aktualizace</span>
                    <span class="meta-value">${esc(s.lastCatalogSync)}</span>
                </div>
            </div>
            ${s.note ? `<p class="supplier-note">${esc(s.note)}</p>` : ''}
            <div class="card-actions">
                <button class="btn-action-red btn-sm" onclick="window.openSupplierEditor(${jsArg(s.id)})">
                    Upravit všechny parametry
                </button>
                <button class="btn-secondary btn-sm" onclick="window.appState.changePriority(${idx}, ${idx - 1})">
                    ↑ Priorita
                </button>
                <button class="btn-secondary btn-sm" onclick="window.appState.changePriority(${idx}, ${idx + 1})">
                    ↓ Priorita
                </button>
                <button class="btn-secondary btn-sm" onclick="window.appState.toggleSupplierStatus(${jsArg(s.name)})">
                    ${s.status === 'ACTIVE' ? 'Pozastavit' : 'Reaktivovat'}
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
                        <h3 class="product-main-title">${esc(product.productName)}</h3>
                        <span style="font-size: 12px; color: var(--text-muted);">${esc(allVariants.length)} varianty &middot; propojeno na ${totalMappings} dodavatelských záznamů</span>
                    </div>
                </div>

                ${allVariants.map(variant => `
                    <div class="variant-card-box">
                        <div class="variant-title-bar">
                            <div>
                                <span class="item-tag" style="margin-right: 6px;">VARIANTA</span>
                                <b style="font-size: 14px;">${esc(variant.variantName)}</b>
                                <span style="font-size: 12px; color: var(--text-subtle); margin-left: 8px;">E-shopový kód: <code style="background: var(--bg-subtle); padding: 2px 6px; border-radius: 4px;">${esc(variant.eshopSku)}</code></span>
                            </div>
                            <button class="btn-action-red btn-sm" onclick="window.openMappingEditor(null, ${jsArg(product.productId)}, ${jsArg(variant.variantId)})">
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
                                <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;flex-wrap:wrap;">
                                    <span class="mapping-priority-pill">P${esc(m.priority)}</span>
                                    <b style="font-size:13px;">${esc(m.supplierName)}</b>
                                    <code class="code-inline">${esc(m.supplierSku)}</code>
                                </div>
                                <div class="mapping-details-row">
                                    <div class="mapping-detail">
                                        <span class="mapping-detail-label">Cena</span>
                                        <b>${esc(m.purchasePriceCzk)} Kč</b>
                                    </div>
                                    <div class="mapping-detail">
                                        <span class="mapping-detail-label">Sklad</span>
                                        <b class="${m.supplierStock > 0 ? 'text-success' : 'text-danger'}">${esc(m.supplierStock)} ks</b>
                                    </div>
                                    <div class="mapping-detail">
                                        <span class="mapping-detail-label">Lhůta</span>
                                        <b>${esc(m.leadTimeDays)} d</b>
                                    </div>
                                    <span class="status-pill ${m.active ? 'status-ready' : 'status-pending'}">${m.active ? 'Aktivní' : 'Neaktivní'}</span>
                                </div>
                                <div class="mapping-actions">
                                    <button class="btn-action-red btn-sm" onclick="window.openMappingEditor(${jsArg(m.id)})">Upravit vše</button>
                                    <button class="btn-secondary btn-sm" onclick="window.appState.toggleMappingActive(${jsArg(m.id)})">${m.active ? 'Deaktivovat' : 'Aktivovat'}</button>
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
                        <td style="font-family: monospace; font-size: 11px; color: var(--text-subtle);">${esc(r.timestamp)}</td>
                        <td>
                            <span class="manual-override-badge">${r.targetType === 'SUPPLIER_SELECTION' ? 'Změna dodavatele' 
                                : r.targetType === 'ORDER_QUANTITY' ? 'Změna množství'
                                : r.targetType === 'GOODS_RECEIPT' ? 'Korekce příjmu'
                                : r.targetType === 'ALLOCATION' ? 'Přeřazení zboží'
                                : 'Ruční zásah'}</span>
                        </td>
                        <td><b>${esc(r.targetId)}</b>${r.orderId ? `<br><small style="color:var(--text-subtle)">Objednávka: ${esc(r.orderId)}</small>` : ''}</td>
                        <td style="color: var(--text-muted);">
                            <s>${esc(r.originalValue)}</s>
                        </td>
                        <td style="font-weight: 700; color: var(--brand-red);">${esc(r.newValue)}</td>
                        <td>
                            <span style="font-size: 12px; color: var(--text-muted);">👤 ${esc(r.user)}</span>
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
            guideToggle.textContent = guidePanel.classList.contains('hidden')
                ? UI_GUIDE.sidebar.toggleShow
                : UI_GUIDE.sidebar.toggleHide;
        };
    }
    if (closeGuide && guidePanel) {
        closeGuide.onclick = () => {
            guidePanel.classList.add('hidden');
            if (guideToggle) guideToggle.textContent = UI_GUIDE.sidebar.toggleShow;
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

    // Bulk actions
    const bulkPrintBtn = document.getElementById('btn-bulk-print-labels');
    const bulkShipBtn = document.getElementById('btn-bulk-ship-orders');
    const bulkApproveBtn = document.getElementById('btn-bulk-approve-pos');
    const invBtn = document.getElementById('btn-inventory-mode');
    if (bulkPrintBtn) bulkPrintBtn.onclick = () => window.appState.bulkPrintLabels();
    if (bulkShipBtn) bulkShipBtn.onclick = () => window.appState.bulkShipReadyOrders();
    if (bulkApproveBtn) bulkApproveBtn.onclick = () => window.appState.bulkApprovePOs();
    if (invBtn) invBtn.onclick = () => window.appState.startInventoryMode();

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
            orderFilterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const filterVal = btn.getAttribute('data-filter');
            state.orderFilter = filterVal;
            state.render();
        };
    });

    // Add supplier — full editor modal
    const btnAddSupplier = document.getElementById('btn-add-supplier-dialog');
    if (btnAddSupplier) {
        btnAddSupplier.onclick = () => window.openSupplierEditor(null);
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

    // Add Feed Dialog (Full Visual Modal)
    const btnAddFeed = document.getElementById('btn-add-feed-dialog');
    const feedModal = document.getElementById('feed-modal');
    const feedModalClose = document.getElementById('feed-modal-close-btn');
    const feedModalBody = document.getElementById('feed-modal-body');

    if (btnAddFeed && feedModal && feedModalBody) {
        btnAddFeed.onclick = () => {
            feedModalBody.innerHTML = `
                <form id="feed-form" style="display:flex; flex-direction:column; gap:16px;">
                    <div>
                        <label class="text-label mb-1">URL Adresa XML / CSV Feedu dodavatele:</label>
                        <input type="url" id="feed-url-input" class="w-full" required style="padding:10px; border:1px solid var(--border-color); border-radius:var(--radius-sm);" value="https://supplier-portal.cz/export/catalog.xml" />
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div>
                            <label class="text-label mb-1">Dodavatel:</label>
                            <select id="feed-supplier-select" style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:var(--radius-sm);">
                                <option value="Helikon-Tex">Helikon-Tex</option>
                                <option value="Brandit CZ">Brandit CZ</option>
                                <option value="Mil-Tec Wholesale">Mil-Tec Wholesale</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-label mb-1">Frekvence synchronizace:</label>
                            <select style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:var(--radius-sm);">
                                <option value="15">Každých 15 minut</option>
                                <option value="60" selected>Každou hodinu</option>
                                <option value="360">Každých 6 hodin</option>
                            </select>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
                        <button type="button" class="btn-secondary btn-sm" id="btn-cancel-feed">Zrušit</button>
                        <button type="submit" class="btn-action-red btn-sm">📡 Připojit a stáhnout feed</button>
                    </div>
                </form>
            `;
            feedModal.classList.add('active');

            document.getElementById('btn-cancel-feed').onclick = () => feedModal.classList.remove('active');
            document.getElementById('feed-form').onsubmit = (e) => {
                e.preventDefault();
                const url = document.getElementById('feed-url-input').value;
                const supp = document.getElementById('feed-supplier-select').value;
                feedModal.classList.remove('active');
                
                const feedsList = document.getElementById('feeds-list');
                if (feedsList) {
                    const newCard = document.createElement('div');
                    newCard.className = 'item-card mb-3';
                    newCard.style.borderLeft = '4px solid var(--success-text)';
                    newCard.innerHTML = `
                        <div class="item-card-header">
                            <div>
                                <span class="item-tag">AKTIVNÍ DATOVÝ FEED</span>
                                <h3 class="card-title">${supp.toUpperCase()}</h3>
                            </div>
                            <span class="status-pill status-ready">Synchronizováno</span>
                        </div>
                        <div class="mb-2">
                            <p><b>Zdroj URL:</b> <code>${url}</code></p>
                            <p><b>Frekvence:</b> Každou hodinu &middot; <b>Položek:</b> 1 420 ks (100% spárováno)</p>
                        </div>
                    `;
                    feedsList.prepend(newCard);
                }
                showToast(`📡 Feed pro dodavatele "${supp}" byl úspěšně uplatněn a zapsán!`, 'success');
            };
        };
        if (feedModalClose) feedModalClose.onclick = () => feedModal.classList.remove('active');
    }

    // Add Carrier Dialog (Full Visual Modal)
    const btnAddCarrier = document.getElementById('btn-add-carrier-dialog');
    const carrierModal = document.getElementById('carrier-modal');
    const carrierModalClose = document.getElementById('carrier-modal-close-btn');
    const carrierModalBody = document.getElementById('carrier-modal-body');

    if (btnAddCarrier && carrierModal && carrierModalBody) {
        btnAddCarrier.onclick = () => {
            carrierModalBody.innerHTML = `
                <form id="carrier-form" style="display:flex; flex-direction:column; gap:16px;">
                    <div>
                        <label class="text-label mb-1">Název přepravce / Dopravce:</label>
                        <input type="text" id="carrier-name-input" class="w-full" required style="padding:10px; border:1px solid var(--border-color); border-radius:var(--radius-sm);" value="GLS CZ & SK" />
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div>
                            <label class="text-label mb-1">Typ integrace:</label>
                            <select style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:var(--radius-sm);">
                                <option value="API">Přímé API generování štítků</option>
                                <option value="CSV">Sledovací čísla z CSV</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-label mb-1">Průměrná doba doručení:</label>
                            <input type="text" value="24 hodin (Do druhého dne)" style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:var(--radius-sm);" />
                        </div>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
                        <button type="button" class="btn-secondary btn-sm" id="btn-cancel-carrier">Zrušit</button>
                        <button type="submit" class="btn-action-red btn-sm">🚚 Uložit dopravce</button>
                    </div>
                </form>
            `;
            carrierModal.classList.add('active');

            document.getElementById('btn-cancel-carrier').onclick = () => carrierModal.classList.remove('active');
            document.getElementById('carrier-form').onsubmit = (e) => {
                e.preventDefault();
                const name = document.getElementById('carrier-name-input').value;
                carrierModal.classList.remove('active');

                const carriersList = document.getElementById('carriers-list');
                if (carriersList) {
                    const newCard = document.createElement('div');
                    newCard.className = 'item-card mb-3';
                    newCard.style.borderLeft = '4px solid var(--info-text)';
                    newCard.innerHTML = `
                        <div class="item-card-header">
                            <div>
                                <span class="item-tag">PŘEPRAVNÍ SLUŽBA</span>
                                <h3 class="card-title">${name.toUpperCase()}</h3>
                            </div>
                            <span class="status-pill status-ready">Aktivní pro expedici</span>
                        </div>
                        <div class="mb-2">
                            <p><b>Sledování zásilek:</b> Integrováno přes API/Štítky &middot; <b>Doba doručení:</b> 24 hodin</p>
                        </div>
                    `;
                    carriersList.prepend(newCard);
                }
                showToast(`🚚 Dopravce "${name}" byl vytvořen a zapsán do seznamu.`, 'success');
            };
        };
        if (carrierModalClose) carrierModalClose.onclick = () => carrierModal.classList.remove('active');
    }

    // Add Rule Dialog (Full Visual Modal)
    const btnAddRule = document.getElementById('btn-add-rule-dialog');
    const ruleModal = document.getElementById('rule-modal');
    const ruleModalClose = document.getElementById('rule-modal-close-btn');
    const ruleModalBody = document.getElementById('rule-modal-body');

    if (btnAddRule && ruleModal && ruleModalBody) {
        btnAddRule.onclick = () => {
            ruleModalBody.innerHTML = `
                <form id="rule-form" style="display:flex; flex-direction:column; gap:20px;">
                    <div>
                        <label class="text-label mb-1">Název pravidla:</label>
                        <input type="text" id="rule-name-input" class="w-full" required style="padding:10px; border:1px solid var(--border-color); border-radius:var(--radius-sm); font-size:14px;" placeholder="Např. Automaticky schválit nákup pod 10 000 Kč" />
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                        <div>
                            <label class="text-label mb-1">Spouštěcí podmínka:</label>
                            <select id="rule-condition-select" style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:var(--radius-sm); font-size:13px;">
                                <optgroup label="Stav skladu">
                                    <option>Všechny položky jsou skladem u 1 dodavatele</option>
                                    <option>Primární dodavatel nemá dostatek zboží</option>
                                    <option>Zásoby klesnou pod minimální úroveň</option>
                                    <option>Zásoby klesnou pod 0 ks</option>
                                    <option>Objednávka čeká déle než 48 hodin</option>
                                </optgroup>
                                <optgroup label="Finanční podmínky">
                                    <option>Celková nákupní cena je pod 5 000 Kč</option>
                                    <option>Celková nákupní cena je pod 10 000 Kč</option>
                                    <option>Celková nákupní cena je pod 50 000 Kč</option>
                                    <option>Marže objednávky je nad 20 %</option>
                                    <option>Marže objednávky je nad 30 %</option>
                                </optgroup>
                                <optgroup label="Logistické podmínky">
                                    <option>Dodací lhůta dodavatele je kratší než 24 hodin</option>
                                    <option>Dodací lhůta dodavatele je kratší než 48 hodin</option>
                                    <option>Zákazník zvolil expresní dopravu</option>
                                    <option>Zákazník je VIP / opakovaný kupující</option>
                                </optgroup>
                                <optgroup label="Automatizace">
                                    <option>Nová objednávka přijata z e-shopu</option>
                                    <option>Feed od dodavatele byl aktualizován</option>
                                    <option>Každý den v 8:00 ráno</option>
                                    <option>Každou hodinu</option>
                                </optgroup>
                            </select>
                        </div>
                        <div>
                            <label class="text-label mb-1">Akce systému:</label>
                            <select id="rule-action-select" style="width:100%; padding:10px; border:1px solid var(--border-color); border-radius:var(--radius-sm); font-size:13px;">
                                <optgroup label="Nákup">
                                    <option>Okamžitě odeslat objednávku dodavateli e-mailem</option>
                                    <option>Předat ke schválení e-shopařem</option>
                                    <option>Rozdělit objednávku mezi 2 dodavatele (split)</option>
                                    <option>Objednat u nejlevnějšího dostupného dodavatele</option>
                                    <option>Objednat u nejrychlejšího dodavatele</option>
                                </optgroup>
                                <optgroup label="Upozornění">
                                    <option>Poslat e-mail upozornění provozovateli</option>
                                    <option>Zobrazit varování v dashboardu</option>
                                    <option>Poslat SMS / push notifikaci</option>
                                </optgroup>
                                <optgroup label="Expedice">
                                    <option>Automaticky potvrdit a odeslat zásilku</option>
                                    <option>Přiřadit objednávku ke konkrétnímu dopravci</option>
                                    <option>Zadat prioritní expedici (expresní)</option>
                                </optgroup>
                                <optgroup label="Ostatní">
                                    <option>Zablokovat nákup a čekat na manuální schválení</option>
                                    <option>Přesunout objednávku do fronty čekání</option>
                                    <option>Automaticky stornovat objednávku</option>
                                </optgroup>
                            </select>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:4px;">
                        <button type="button" class="btn-secondary" id="btn-cancel-rule">Zrušit</button>
                        <button type="submit" class="btn-action-red">⚡ Uložit a aktivovat pravidlo</button>
                    </div>
                </form>
            `;
            ruleModal.classList.add('active');

            document.getElementById('btn-cancel-rule').onclick = () => ruleModal.classList.remove('active');
            document.getElementById('rule-form').onsubmit = (e) => {
                e.preventDefault();
                const name = document.getElementById('rule-name-input').value;
                const cond = document.getElementById('rule-condition-select').value;
                const act = document.getElementById('rule-action-select').value;
                ruleModal.classList.remove('active');

                const rulesList = document.getElementById('rules-list');
                if (rulesList) {
                    const newCard = document.createElement('div');
                    newCard.className = 'item-card';
                    newCard.style.borderLeft = '4px solid var(--brand-red)';
                    newCard.innerHTML = `
                        <div class="item-card-header">
                            <div style="flex:1;">
                                <span class="item-tag">AUTOMATIZAČNÍ PRAVIDLO · AKTIVNÍ</span>
                                <h3 class="card-title">${name.toUpperCase()}</h3>
                                <p style="font-size:12px; color:var(--text-muted); margin-top:4px;"><b>Podmínka:</b> ${cond} · <b>Akce:</b> ${act}</p>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                                <span class="status-pill status-ready">Aktivní</span>
                                <button class="btn-secondary btn-sm" onclick="this.closest('.item-card').remove(); showToast('Pravidlo bylo odstraněno.', 'info');">🗑 Smazat</button>
                            </div>
                        </div>
                    `;
                    rulesList.prepend(newCard);
                }
                showToast(`⚡ Pravidlo "${name}" bylo uloženo a aktivováno.`, 'success');
            };
        };
        if (ruleModalClose) ruleModalClose.onclick = () => ruleModal.classList.remove('active');
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
    state.currentView = viewName;
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    const targetSection = document.getElementById(`view-${viewName}`);
    if (targetSection) targetSection.classList.add('active');

    const t = getViewMeta(viewName);
    document.getElementById('view-eyebrow').textContent = t.eyebrow;
    document.getElementById('view-title').textContent = t.title;

    // Trigger view-specific rendering
    if (viewName === 'products') renderProductsCatalog(state, '');
    if (viewName === 'suppliers') renderSuppliersManagement(state);
    if (viewName === 'availability') renderAvailabilityView(state);
    if (viewName === 'stats') renderStatsKpiView(state);
    if (viewName === 'pickups') renderPickupsScheduleView(state);
    if (viewName === 'audit') renderFullAuditView(state);
}

// ============================================================
// STATE EXTENSIONS FOR NEW VIEWS
// ============================================================

// Extend AppState with new methods
const _origReset = AppState.prototype.reset;
AppState.prototype.reset = function() {
    this.data.mappings = getInitialMappings();
    this.data.pickupSchedules = JSON.parse(JSON.stringify(InitialState.pickupSchedules));
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
            originalValue: `${esc(m.supplierName)} – ${was ? 'Aktivní' : 'Neaktivní'}`,
            newValue: `${esc(m.supplierName)} – ${m.active ? 'Aktivní' : 'Neaktivní'}`,
            reason: 'Ruční zapnutí/vypnutí mapování dodavatele',
            user: 'E-shopař',
        });
        renderProductsCatalog(this, '');
        showToast(`Mapování ${m.eshopSku} → ${m.supplierName} bylo ${m.active ? 'aktivováno' : 'deaktivováno'}.`, 'success');
    }
};

AppState.prototype.editMapping = function(mappingId) {
    window.openMappingEditor(mappingId);
};

AppState.prototype.addMappingForVariant = function(productId, variantId) {
    window.openMappingEditor(null, productId, variantId);
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
                            <span class="item-tag" style="color: var(--brand-red)">VÝJIMKA ${esc(exc.id)}</span>
                            <h3 class="card-title">${esc(exc.type)}</h3>
                        </div>
                        <span class="status-pill status-exception">Závažnost: ${esc(exc.severity)}</span>
                    </div>
                    <div class="mb-3">
                        <p style="margin-bottom: 6px;"><b>Popis:</b> ${esc(exc.detail)}</p>
                        <p style="margin-bottom: 6px; color: var(--text-muted);"><b>Proč vznikl:</b> ${esc(exc.cause)}</p>
                        <div class="alert-box alert-danger mt-2">
                            <span class="alert-title">Co systém navrhuje:</span>
                            <p class="alert-body">${esc(exc.suggestion)}</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
                        <button class="btn-action-red btn-sm" onclick="window.appState.resolveException(${jsArg(exc.id)})">✓ Použít návrh systému</button>
                        <button class="btn-secondary btn-sm" onclick="window.appState.resolveException(${jsArg(exc.id)})">Vyřešit ručně</button>
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
                                <b style="font-size:14px;">${esc(ord.orderId)}</b>
                                <span style="font-size:12px; color:var(--text-subtle); margin-left:8px;">${esc(ord.customerName)}</span>
                            </div>
                            <button class="btn-secondary btn-sm" onclick="window.openOrder(${jsArg(ord.orderId)})">Detail objednávky →</button>
                        </div>
                        ${ord.items.map(it => {
                            const shortage = Math.max(0, it.required - it.stock);
                            const suppliers = mappingsForOrder.filter(m => m.eshopSku === it.sku && m.active);
                            return shortage > 0 ? `
                                <div style="background:var(--bg-subtle); border-radius:var(--radius-sm); padding:10px; margin-top:8px; font-size:12px;">
                                    <b>${esc(it.productName)}</b>
                                    <span class="shortage-badge-red" style="margin-left:8px;">Chybí ${shortage} ks</span>
                                    <span class="stock-badge-green" style="margin-left:4px;">Skladem: ${esc(it.stock)} ks</span>
                                    ${suppliers.length > 0 ? `
                                        <div style="margin-top:6px; color:var(--text-muted);">
                                            <b>Dostupní dodavatelé pro doplnění:</b>
                                            ${suppliers.map(s => `<span style="margin-left:6px;">🏢 ${esc(s.supplierName)} (${esc(s.supplierStock)} ks, ${esc(s.leadTimeDays)}d, ${esc(s.purchasePriceCzk)} Kč/ks)</span>`).join(' ·')}
                                        </div>` : '<div style="color:var(--danger-text); margin-top:4px;">⚠️ Žádný aktivní dodavatel pro tuto položku!</div>'}
                                </div>` : '';
                        }).join('')}
                        ${ord.procurement.length > 0 ? `
                            <div style="margin-top:8px; font-size:12px; color:var(--info-text);">
                                <b>🛒 Systém objednal:</b>
                                ${ord.procurement.map(p => `${esc(p.supplier)} (${esc(p.quantity)} ks, ETA: ${esc(p.eta)})`).join(' + ')}
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
                id: `ord-${esc(ord.orderId)}-${esc(a.time)}`,
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
                        <td style="font-family: monospace; color: var(--text-subtle); white-space:nowrap;">${esc(r.timestamp)}</td>
                        <td>
                            <span class="${r.user === 'SYSTÉM' ? 'status-pill status-info' : 'manual-override-badge'}">
                                ${r.targetType === 'SUPPLIER_SELECTION' ? '🤖 Výběr dodavatele'
                                    : r.targetType === 'GOODS_RECEIPT' ? '📥 Příjem zboží'
                                    : r.targetType === 'ALLOCATION' ? '🔗 Alokace'
                                    : r.targetType === 'MANUAL_OVERRIDE' ? '✋ Ruční zásah'
                                    : '⚙️ Systémová akce'}
                            </span>
                        </td>
                        <td><b>${esc(r.targetId)}</b></td>
                        <td style="max-width:240px;">${esc(r.newValue)}</td>
                        <td style="color: var(--text-muted); max-width:200px;">${esc(r.reason)}</td>
                        <td><span style="font-size:11px;">👤 ${esc(r.user)}</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}



// ============================================================
// GLOBAL BINDINGS & INIT
// ============================================================

function initBindings() {
window.appState = state;
window.showToast = showToast;
window.openOrder = (orderId) => {
    const ord = state.data.customerOrders.find(o => o.orderId === orderId);
    if (ord) openOrderDetailModal(ord);
};

// Modal close
function closeOrderModal() {
    const modal = document.getElementById('order-modal');
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

document.getElementById('modal-close-btn').onclick = closeOrderModal;
document.getElementById('order-modal').onclick = (e) => {
    if (e.target === document.getElementById('order-modal')) closeOrderModal();
};

document.getElementById('config-modal-close').onclick = closeConfigModal;
document.getElementById('config-modal').onclick = (e) => {
    if (e.target === document.getElementById('config-modal')) closeConfigModal();
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
const resetBtn = document.getElementById('btn-reset-demo');
const simBtn = document.getElementById('btn-sim-cycle');
if (resetBtn) resetBtn.onclick = () => state.reset();
if (simBtn) simBtn.onclick = () => state.runGuidedDemoCycle();

// Init
setupNavigation();
state.render();
}

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
                        <input type="text" id="feed-name-input" value="${esc(feedData.name)}" placeholder="Např. Fox Outdoor Hlavní Feed" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 4px;">URL adresa feedu:</label>
                        <input type="text" id="feed-url-input" value="${esc(feedData.url)}" placeholder="https://api.supplier.cz/feeds/catalog.xml" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main); background: #fff;">
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
                    <p><b>Název zdroje:</b> ${esc(feedData.name)}</p>
                    <p><b>URL:</b> <code>${esc(feedData.url)}</code></p>
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
                                <p><b>Zdrojová URL:</b> <code>${esc(feedData.url)}</code></p>
                                <p><b>Kódování:</b> ${esc(feedData.encoding)} &middot; <b>Typ:</b> ${esc(feedData.type)} &middot; <b>Frekvence:</b> Každou hodinu</p>
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
    modal.classList.add('active');
};

// ============================================================
// LOGISTICS & KPI IMPLEMENTATION (Stats, Pickups, Multi-Pack, Extra Labels)
// ============================================================

window.renderStatsKpiView = function(appState) {
    const container = document.getElementById('stats-kpi-container');
    if (!container) return;

    const mockKpis = [
        { name: 'Jan Novák', station: 'Stanice A1', packages: 42, items: 128, weight: '68.5 kg', speed: '2 min 15 s / balík', photoCount: 42 },
        { name: 'Klára Svobodová', station: 'Stanice B2', packages: 38, items: 94, weight: '45.0 kg', speed: '2 min 40 s / balík', photoCount: 38 },
        { name: 'Petr Dvořák', station: 'Stanice C1', packages: 29, items: 82, weight: '51.2 kg', speed: '3 min 10 s / balík', photoCount: 29 }
    ];

    container.innerHTML = `
        <!-- FINANČNÍ A CELKOVÉ OPERAČNÍ STATISTIKY -->
        <h4 class="subsection-title mb-3">FINANČNÍ PŘEHLED EXPEDICE & PRŮMĚRY</h4>
        <div class="grid-4 mb-6">
            <div class="info-block" style="background:#f0fdf4; border-color:#bbf7d0;">
                <span class="info-block-label" style="color:#166534;">Hodnota expedice celkem</span>
                <span class="info-block-value" style="color:#15803d; font-size:26px;">184 250 Kč</span>
                <span class="info-block-sub" style="color:#166534;">Za dnešní den (109 balíků)</span>
            </div>
            <div class="info-block" style="background:#eff6ff; border-color:#bfdbfe;">
                <span class="info-block-label" style="color:#1e40af;">Průměrná hodnota 1 obj.</span>
                <span class="info-block-value" style="color:#1d4ed8; font-size:26px;">1 690 Kč</span>
                <span class="info-block-sub" style="color:#1e40af;">Průměrně 2.8 ks / objednávka</span>
            </div>
            <div class="info-block" style="background:#fffbeb; border-color:#fef08a;">
                <span class="info-block-label" style="color:#92400e;">Průměrná cena dopravy</span>
                <span class="info-block-value" style="color:#b45309; font-size:26px;">79 Kč</span>
                <span class="info-block-sub" style="color:#92400e;">Celkem doprava: 8 611 Kč</span>
            </div>
            <div class="info-block" style="background:#faf5ff; border-color:#e9d5ff;">
                <span class="info-block-label" style="color:#6b21a8;">Průměrná cena za balné</span>
                <span class="info-block-value" style="color:#7e22ce; font-size:26px;">18 Kč</span>
                <span class="info-block-sub" style="color:#6b21a8;">Krabice, lepící páska & výplň</span>
            </div>
        </div>

        <h4 class="subsection-title">EVIDENCE BALENÍ NA SKLADOVÝCH STANICÍCH</h4>
        <table class="data-table">
            <thead>
                <tr>
                    <th>Skladník (Kdo balil)</th>
                    <th>Pracovní stanice</th>
                    <th>Zabaleno balíků</th>
                    <th>Kusů zboží</th>
                    <th>Celková váha</th>
                    <th>Průměrný čas / 1 balík</th>
                    <th>Fotogalerie balení</th>
                </tr>
            </thead>
            <tbody>
                ${mockKpis.map(k => `
                    <tr>
                        <td><b>👤 ${esc(k.name)}</b></td>
                        <td><span class="manual-override-badge">📍 ${esc(k.station)}</span></td>
                        <td><b>${esc(k.packages)} balíků</b></td>
                        <td>${esc(k.items)} ks</td>
                        <td><b>${esc(k.weight)}</b></td>
                        <td>${esc(k.speed)}</td>
                        <td><span class="status-pill status-ready">📸 ${esc(k.photoCount)} fotek</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
};

window.renderPickupsScheduleView = function(appState) {
    const container = document.getElementById('pickup-schedule-container');
    if (!container) return;

    const schedules = appState.data.pickupSchedules || [];

    container.innerHTML = `
        <div class="cards-stack">
            ${schedules.map(s => `
                <div class="item-card item-card--brand">
                    <div class="item-card-header">
                        <div>
                            <span class="item-tag">DOPRAVCE & SVOZ</span>
                            <h3 class="card-title">${s.carrier.toUpperCase()}</h3>
                        </div>
                        <span class="status-pill ${s.autoEnabled ? 'status-ready' : 'status-pending'}">${esc(s.status)}</span>
                    </div>
                    <div class="card-meta-grid">
                        <div class="meta-item">
                            <span class="meta-label">Čas automatického svozu</span>
                            <span class="meta-value meta-value--lg">${esc(s.pickupTime)}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Napojení & rozhraní</span>
                            <span class="meta-value">${esc(s.integration)}</span>
                        </div>
                        <div class="meta-item">
                            <span class="meta-label">Balíků ke svozu</span>
                            <span class="meta-value meta-value--success">${esc(s.packagesWaiting)} ks</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="btn-action-red btn-sm" onclick="window.openPickupEditor(${jsArg(s.id)})">Upravit všechny parametry</button>
                        <button class="btn-secondary btn-sm" onclick="showToast(${jsArg('Svoz pro ' + s.carrier + ' byl ručně vyvolán.')}, 'success')">Vyvolat svoz ihned</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
};

// Extend print label logic for multi-pack and additional label generation
AppState.prototype.printAdditionalLabel = function(orderId) {
    const ord = this.data.customerOrders.find(o => o.orderId === orderId);
    if (!ord) return;
    const reason = prompt('Zadejte důvod pro dodatečný štítek (reklamace / rozbití při přepravě):', 'Náhrada za poškozené zboží kurýrem');
    if (!reason) return;

    const carrier = ord.carrier || 'Zásilkovna';
    const tracking = `EXTRA-${esc(ord.orderId)}-${Date.now().toString().slice(-6)}`;

    const labelWindow = window.open('', '_blank', 'width=440,height=340');
    if (labelWindow) {
        labelWindow.document.write(`
            <html><head><title>DODATEČNÝ ŠTÍTEK — ${orderId}</title>
            <style>body{font-family:sans-serif;padding:15px;} .box{border:3px solid #dc2626;padding:16px;border-radius:8px;} .tag{background:#fee2e2;color:#dc2626;font-weight:900;padding:4px;font-size:11px;display:inline-block;}</style>
            </head><body>
            <div class="box">
                <div class="tag">⚠️ DODATEČNÝ ŠTÍTEK (REKLAMACE / ZTRÁTA ZÁSILKY)</div>
                <h2>${carrier}</h2>
                <div><b>Příjemce:</b> ${esc(ord.customerName)}</div>
                <div><b>Objednávka:</b> ${orderId}</div>
                <div><b>Důvod vydání:</b> ${reason}</div>
                <div style="font-size:24px;font-family:monospace;margin-top:10px;">|||||| ${tracking} ||||||</div>
            </div>
            <script>window.print();<\/script>
            </body></html>
        `);
        labelWindow.document.close();
    }
    ord.auditTrail.unshift({
        time: new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
        actor: 'USER',
        action: `Vytisknut dodatečný štítek (${tracking}). Důvod: "${reason}".`
    });
    showToast(`🖨️ Dodatečný štítek vygenerován (${tracking}).`, 'success');
};

AppState.prototype.generateMultiPackLabels = function(orderId) {
    const ord = this.data.customerOrders.find(o => o.orderId === orderId);
    if (!ord) return;
    const countStr = prompt('Do kolika balíků balíte tuto objednávku?', '2');
    if (!countStr || isNaN(parseInt(countStr, 10))) return;
    const count = parseInt(countStr, 10);

    const carrier = ord.carrier || 'DPD CZ';
    const labelWindow = window.open('', '_blank', 'width=480,height=400');
    if (labelWindow) {
        let content = `<html><head><title>Vícebalíková expedice — ${orderId}</title><style>body{font-family:sans-serif;padding:15px;} .box{border:3px solid #000;padding:14px;margin-bottom:15px;border-radius:8px;}</style></head><body>`;
        for (let i = 1; i <= count; i++) {
            const track = `MULTI-${esc(ord.orderId)}-${i}/${count}-${Date.now().toString().slice(-4)}`;
            content += `
                <div class="box">
                    <div style="display:flex;justify-space-between;"><b>${carrier}</b> <span>BALÍK <b>${i} z ${count}</b></span></div>
                    <div><b>Příjemce:</b> ${esc(ord.customerName)} (Objednávka ${orderId})</div>
                    <div style="font-size:22px;font-family:monospace;margin:8px 0;">||||| ${track} |||||</div>
                    <div style="font-size:11px;color:#555;">Skladová výdejka: Zkontrolováno &amp; Vyfoceno na stanici</div>
                </div>
            `;
        }
        content += `<script>window.print();<\/script></body></html>`;
        labelWindow.document.write(content);
        labelWindow.document.close();
    }
    showToast(`🖨️ Vygenerováno ${count} štítků pro vícebalíkovou zásilku.`, 'success');
};

buildAppShell();
initBindings();

