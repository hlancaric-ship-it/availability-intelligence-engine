/**
 * L-Code Nexus — Centrální UI konfigurace
 * Všechny texty, labely, stavy a vizuální tokeny na jednom místě.
 * Úprava hodnot zde se okamžitě projeví v celém rozhraní.
 */

export const UI_THEME = {
  /* Pozadí & plochy */
  bgApp: '#F0F4FA',
  bgSurface: '#FFFFFF',
  bgSubtle: '#EEF2FF',
  bgMuted: '#E2E8F0',

  /* Typografie */
  textMain: '#1E293B',
  textMuted: '#475569',
  textSubtle: '#64748B',
  borderColor: '#E2E8F0',

  /* Brand — živá červeno-oranžová (L-Code) */
  brandPrimary: '#E11D48',
  brandPrimaryHover: '#BE123C',
  brandPrimaryLight: '#FFF1F2',
  brandPrimaryBorder: '#FECDD3',
  brandGradient: 'linear-gradient(135deg, #E11D48 0%, #F97316 55%, #FB923C 100%)',

  /* Sekundární akcent — indigo */
  accentSecondary: '#6366F1',
  accentSecondaryLight: '#EEF2FF',
  accentSecondaryBorder: '#C7D2FE',

  /* Sémantika */
  success: '#059669',
  successBg: '#ECFDF5',
  successBorder: '#A7F3D0',
  warning: '#D97706',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
  info: '#2563EB',
  infoBg: '#EFF6FF',
  infoBorder: '#BFDBFE',

  /* Typografie */
  fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyDisplay: "'Plus Jakarta Sans', sans-serif",
};

export const UI_BRAND = {
    badge: 'NEXUS',
    title: 'L-Code Nexus',
    subtitle: 'Autonomní nákup & sklad',
    pageTitle: 'L-Code Nexus – Autonomní nákup & sklad',
};

export const UI_TENANT = {
    name: 'Ukázkový e-shop',
    sandboxLabel: '100% Sandbox mód',
    sandboxIcon: '🔒',
    dotColor: '#22C55E',
};

export const UI_ACTIONS = {
    resetDemo: { id: 'btn-reset-demo', label: '↺ Reset', title: 'Vrátí všechna data do původního stavu' },
    simCycle: { id: 'btn-sim-cycle', label: '⚡ Demo scénář', title: 'Simuluje nákup a příjem' },
};

export const UI_NAV = {
    sections: [
        {
            id: 'operations',
            label: 'OPERACE',
            items: [
                { view: 'dashboard', icon: '📊', label: 'Přehled', badgeId: null },
                { view: 'orders', icon: '📦', label: 'Objednávky', badgeId: 'sidebar-orders-count' },
                { view: 'availability', icon: '📊', label: 'Dostupnost', badgeId: 'sidebar-exceptions-count', badgeClass: 'alert-count' },
                { view: 'procurement', icon: '🛒', label: 'Nákup', badgeId: 'sidebar-po-count', badgeClass: 'warning-badge' },
                { view: 'receiving', icon: '📥', label: 'Příjem zboží', badgeId: null },
            ],
        },
        {
            id: 'settings',
            label: 'NASTAVENÍ',
            spaced: true,
            items: [
                { view: 'suppliers', icon: '🏢', label: 'Dodavatelé', badgeId: null },
                { view: 'products', icon: '🏷️', label: 'Produkty & Mapování', badgeId: null },
                { view: 'feeds', icon: '📡', label: 'Feedy', badgeId: null },
                { view: 'carriers', icon: '🚚', label: 'Dopravci', badgeId: null },
                { view: 'rules', icon: '⚡', label: 'Pravidla', badgeId: null },
                { view: 'settings', icon: '⚙️', label: 'Nastavení nákupu', badgeId: null },
                { view: 'stats', icon: '📈', label: 'Statistiky & KPI', badgeId: null },
                { view: 'pickups', icon: '⏰', label: 'Svozy dopravců', badgeId: null },
                { view: 'audit', icon: '📝', label: 'Audit', badgeId: null },
            ],
        },
    ],
};

export const UI_GUIDE = {
    sidebar: {
        headerIcon: '💡',
        header: 'Průvodce nového e-shopaře',
        description: 'Jak nastavit dodavatele, propojit varianty a řídit automatické nákupy krok za krokem.',
        toggleShow: 'Zobrazit rychlého průvodce',
        toggleHide: 'Skrýt průvodce',
    },
    panel: {
        badge: 'PRŮVODCE PRO NOVÉHO E-SHOPAŘE',
        title: '5 jednoduchých kroků k plně automatickému nákupu',
        subtitle: 'Nastavte systém během několika minut a nechte ho automaticky hlídat sklad a sestavovat nákupy:',
        steps: [
            { n: 1, title: 'Přidejte dodavatele', desc: '<b>Co dělám:</b> Zadáte název, kontakt a dodací lhůtu.<br><b>Proč:</b> Systém ví, u koho může objednávat.' },
            { n: 2, title: 'Nastavte způsob nákupu', desc: '<b>Co dělám:</b> Zvolíte e-mail, B2B portál nebo objednávkový formulář.' },
            { n: 3, title: 'Propojte produkty & varianty', desc: '<b>Co dělám:</b> Přiřadíte konkrétní velikosti k dodavatelským kódům (i více dodavatelů k 1 produktu).' },
            { n: 4, title: 'Nastavte priority', desc: '<b>Co dělám:</b> Určíte, kdo je hlavní a kdo záložní partner při výpadku skladu.' },
            { n: 5, title: 'Spusťte automatiku', desc: '<b>Co se stane:</b> Systém sám kontroluje objednávky ze Shoptetu a navrhuje nákupy.', ready: true },
        ],
    },
};

export const UI_VIEWS = {
    dashboard: {
        eyebrow: 'PŘEHLED',
        title: 'AUTONOMNÍ NÁKUP & DOSTUPNOST',
        contextVariant: 'default',
        context: [
            { label: '📌 CO SE PRÁVĚ DĚJE', text: 'Systém zkontroloval dnešní objednávky ze Shoptetu a zjistil chybějící položky na skladě. Automaticky navrhl nákup u dodavatelů.' },
            { label: '👁️ PROČ TO VIDÍTE', text: 'Toto je vaše denní operační centrum: okamžitě víte, co můžete zabalit a kde je potřeba vaše potvrzení.' },
            { label: '👉 CO MÁTE UDĚLAT', text: '1. Schvalte nákupy u dodavatelů ve sloupci 1.<br>2. Objednávky ze sloupce 3 můžete rovnou zabalit a odeslat.' },
            { label: '⚡ CO SE STANE POTOM', text: 'Po schválení systém rozešle nákupy dodavatelům. Jakmile zboží dorazí, samo se přiřadí ke konkrétním zákazníkům.' },
        ],
        kpis: [
            { id: 'kpi-pending', targetView: 'procurement', variant: 'warning', label: 'Nákupy u dodavatelů k potvrzení', pill: 'Vyžaduje akci', pillClass: 'pill-warning', valueId: 'kpi-pending-val', desc: 'Systém je automaticky sestavil podle dostupnosti zboží. Po vašem potvrzení budou odeslány dodavatelům.', hint: 'Přejít ke schválení →', hintClass: '' },
            { id: 'kpi-exceptions', targetView: 'availability', variant: 'danger', label: 'Výjimky & ruční zásahy', pill: 'Ke kontrole', pillClass: 'pill-danger', pillId: 'kpi-alert-badge', valueId: 'kpi-exceptions-val', desc: 'Případy, kdy dodavatel nemá skladem potřebné kusy nebo vznikla neshoda v dodaném množství.', hint: 'Vyřešit výjimky →', hintClass: 'text-danger' },
            { id: 'kpi-ready', targetView: 'orders', variant: 'success', label: 'Objednávky připravené k zabalení', pill: 'Expedice', pillClass: 'pill-success', valueId: 'kpi-ready-val', desc: 'Veškeré zboží je 100% skladem a spárováno. Můžete vytisknout štítky a zabalit balíky.', hint: 'Otevřít seznam k expedici →', hintClass: 'text-success' },
        ],
        columns: [
            { listId: 'pending-list', countId: 'pending-count', title: '1. Čeká na schválení nákupu', titleClass: '', subtext: 'Systém sestavil optimální nákup u dodavatelů. Schvalte odeslání.' },
            { listId: 'exceptions-list', countId: 'exceptions-count', title: '2. Vyžaduje vaši akci (Výjimky)', titleClass: 'text-danger', countClass: 'count-danger', subtext: 'Chybějící nabídky nebo nesrovnalosti vyžadující rozhodnutí e-shopaře.' },
            { listId: 'ready-list', countId: 'ready-count', title: '3. Připraveno k zabalení', titleClass: 'text-success', countClass: 'count-success', subtext: 'Zboží je kompletně připraveno. Kliknutím zobrazíte detail a můžete balit.' },
        ],
    },
    availability: {
        eyebrow: 'DOSTUPNOST & DEFICIT',
        title: 'ANALÝZA NEDOSTATKU ZBOŽÍ A NAVRHOVANÁ ŘEŠENÍ',
        contextVariant: 'danger',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Analýza deficitů skladem a navrhovaná řešení. Systém ukazuje, které objednávky mají problém s dostupností.' },
            { label: '👁️ PROČ TO VIDÍTE', text: 'Abyste měli přehled o situacích, kde chybí zboží nebo se musí objednat u dodavatele.' },
            { label: '👉 CO MÁTE UDĚLAT', text: 'Ověřte, že AIE vybral správného dodavatele, nebo intervenujte — vyberte jiného partnera či upravte množství.' },
            { label: '⚡ CO SE STANE POTOM', text: 'Systém přepočítá nákup podle vašeho rozhodnutí a položka se přesune k čekajícím na dodání.' },
        ],
        sections: [
            { title: 'OBJEDNÁVKY S DEFICITY (VYŽADUJÍ ŘEŠENÍ)', subtitle: 'Každá položka ukazuje, co chybí, proč je to potřeba objednat a co AIE navrhuje:', contentId: 'full-exceptions-list', contentClass: 'exceptions-full-list', spaced: true },
            { title: 'ROZHODOVACÍ ŘETĚZEC (AUDIT TRAIL)', subtitle: 'Co systém detekoval, jak vyhodnotil dodavatele a jaké rozhodnutí provedl:', contentId: 'interventions-audit-list' },
        ],
    },
    orders: {
        eyebrow: 'OBJEDNÁVKY',
        title: 'STAV A DETAIL OBJEDNÁVEK',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Přehled všech zákaznických objednávek ze Shoptetu a stavu jejich naskladnění a přiřazení.' },
            { label: '👁️ PROČ TO VIDÍTE', text: 'Abyste měli 100% přehled o tom, které objednávky již můžete expedovat a na které zboží ještě čekáte.' },
            { label: '👉 CO MÁTE UDĚLAT', text: 'Klikněte na kteroukoli objednávku pro otevření jejího příběhu, stavu položek a možností ruční úpravy.' },
            { label: '⚡ CO SE STANE POTOM', text: 'U kompletních objednávek můžete ihned expedovat. U čekajících systém zboží přiřadí okamžitě po doručení.' },
        ],
        section: {
            title: 'ZÁKAZNICKÉ OBJEDNÁVKY & STAV EXPEDICE',
            subtitle: 'Kliknutím na řádek otevřete detailní příběh a možnosti ručních úprav.',
            actions: [
                { id: 'btn-bulk-print-labels', label: '🖨️ Hromadně vytisknout štítky', variant: 'secondary' },
                { id: 'btn-bulk-ship-orders', label: '📦 Hromadně expedovat připravené', variant: 'success' },
            ],
            search: { id: 'order-search-input', placeholder: '🔍 Hledat objednávku podle čísla nebo jména...' },
            filters: [
                { filter: 'ALL', label: 'Všechny' },
                { filter: 'READY', label: 'K expedici' },
                { filter: 'WAITING', label: 'Čekající na zboží' },
            ],
            contentId: 'full-orders-list',
            contentClass: 'orders-table-wrapper',
        },
    },
    procurement: {
        eyebrow: 'NÁKUP',
        title: 'NÁKUPNÍ OBJEDNÁVKY U DODAVATELŮ',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Seznam nákupních objednávek u dodavatelů sestavených systémem pro pokrytí deficitu skladu.' },
            { label: '👁️ PROČ TO VIDÍTE', text: 'Máte plnou kontrolu nad tím, komu a v jakém objemu se objednává zboží před jeho odesláním.' },
            { label: '👉 CO MÁTE UDĚLAT', text: 'Klikněte na „✓ Schválit nákup u dodavatele" u objednávek, které chcete potvrdit.' },
            { label: '⚡ CO SE STANE POTOM', text: 'Podklady se odešlou dodavateli a nákup se přesune do sekce Příjem zboží, kde čeká na naskladnění.' },
        ],
        section: {
            title: 'NÁKUPNÍ OBJEDNÁVKY U DODAVATELŮ',
            subtitle: 'Přehled vygenerovaných nákupů, termínů doručení a stavu schválení.',
            action: { id: 'btn-bulk-approve-pos', label: '⚡ Hromadně schválit & odeslat všechny nákupy', sm: true },
            contentId: 'full-po-list',
            contentClass: 'po-grid',
        },
    },
    receiving: {
        eyebrow: 'PŘÍJEM',
        title: 'PŘÍJEM ZBOŽÍ & NASKLADNĚNÍ',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Doručovací zásilky od dodavatelů, které jsou na cestě nebo právě dorazily na váš sklad.' },
            { label: '👁️ PROČ TO VIDÍTE', text: 'Zde potvrzujete fyzické převzetí balíků a kontrolu proti dodacímu listu.' },
            { label: '👉 CO MÁTE UDĚLAT', text: 'Po převzetí balíku klikněte na „📥 Potvrdit příjem balíku & Automaticky přiřadit k objednávkám".' },
            { label: '⚡ CO SE STANE POTOM', text: 'Systém naskladní kusy, ihned je přiřadí k čekajícím zákazníkům a přepne objednávky na „Připraveno k vyřízení".' },
        ],
        section: {
            title: 'PŘÍJEM ZBOŽÍ NA SKLAD & KONTROLA ZÁSILEK',
            subtitle: 'Porovnání objednaného, skutečně přijatého a zbývajícího množství s automatickým přiřazením k zákazníkům.',
            scan: { id: 'barcode-scan-input', placeholder: '📷 Pípněte skenerem čárový kód EAN / SKU položky nebo číslo nákupního balíku...', accent: true },
            scanBtn: { id: 'btn-process-scan', label: '🔍 Zpracovat sken' },
            contentId: 'receiving-list',
            contentClass: 'receiving-grid',
        },
    },
    suppliers: {
        eyebrow: 'DODAVATELÉ',
        title: 'SPRÁVA DODAVATELŮ',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Správa integrovaných dodavatelů, jejich priorit, dodacích lhůt a způsobů objednávání.' },
            { label: '👁️ PROČ TO VIDÍTE', text: 'Zde určujete, od koho má systém zboží poptávat a jakým způsobem se mu nákupní podklady předávají.' },
            { label: '👉 CO MÁTE UDĚLAT', text: 'Můžete přidat nového dodavatele, upravit prioritu partnera nebo změnit způsob objednání.' },
            { label: '⚡ CO SE STANE POTOM', text: 'Systém při výpočtu nákupu automaticky upřednostňuje partnery s nejvyšší prioritou a nejrychlejším dodáním.' },
        ],
        section: {
            title: 'SPRÁVA DODAVATELŮ',
            subtitle: 'Přehled partnerských velkoobchodů, stavů nabídek a nákupních podmínek:',
            action: { id: 'btn-add-supplier-dialog', label: '+ Přidat nového dodavatele', sm: true },
            contentId: 'suppliers-list',
            contentClass: 'suppliers-grid',
        },
    },
    products: {
        eyebrow: 'PRODUKTY',
        title: 'PRODUKTY & MAPOVÁNÍ NA DODAVATELE',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Centrální správa produktů, variant (barvy/velikosti) a jejich propojení na konkrétní dodavatele.' },
            { label: '👁️ PROČ TO VIDÍTE', text: 'Zde určujete: „Tento produkt mohu nakoupit u Dodavatele A i Dodavatele B pod těmito dodavatelskými kódy."' },
            { label: '👉 CO MÁTE UDĚLAT', text: 'Vyhledejte produkt a propojte jeho varianty s dodavateli nebo upravte nákupní ceny a dodavatelské kódy.' },
            { label: '⚡ CO SE STANE POTOM', text: 'Pokud zboží chybí na skladě, systém přesně ví, jaký dodavatelský kód má u kterého partnera objednat.' },
        ],
        section: {
            title: 'PRODUKTY & MAPOVÁNÍ NA DODAVATELE',
            subtitle: 'Vyhledávání produktů podle názvu, e-shopového kódu nebo dodavatelského kódu (SKU):',
            actions: [
                { id: 'btn-inventory-mode', label: '📋 Rychlá inventura zásoby', variant: 'secondary' },
                { id: 'btn-add-mapping-dialog', label: '+ Propojit produkt s dodavatelem', variant: 'primary' },
            ],
            search: { id: 'product-search-input', placeholder: '🔍 Hledat produkt podle názvu, kódu nebo kódu dodavatele...' },
            clearSearch: { id: 'btn-clear-search', label: 'Zrušit filtr' },
            contentId: 'products-catalog-list',
        },
    },
    settings: {
        eyebrow: 'NASTAVENÍ',
        title: 'NASTAVENÍ NÁKUPNÍCH PRAVIDEL',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Nastavení obchodních pravidel a strategií, podle kterých systém autonomně rozhoduje o nákupech.' },
            { label: '👁️ PROČ TO VIDÍTE', text: 'Máte plnou kontrolu nad chováním nákupního algoritmu: jak preferovat partnery a co dělat při výpadku skladu.' },
            { label: '👉 CO MÁTE UDĚLAT', text: 'Zvolte preferovanou strategii nákupu, limity pro schvalování a uložte pravidla.' },
            { label: '⚡ CO SE STANE POTOM', text: 'Systém okamžitě aplikuje tato pravidla na všechny nově příchozí objednávky z e-shopu.' },
        ],
        section: {
            title: 'PRAVIDLA A STRATEGIE AUTOMATICKÉHO NÁKUPU',
            subtitle: 'Každé pravidlo jasně vysvětluje, jak ovlivňuje výběr dodavatelů a nákupní objednávky:',
            contentId: 'settings-form-wrapper',
        },
        blocks: [
            {
                title: '1. Hlavní nákupní strategie',
                desc: '<b>Co toto nastavení ovlivňuje:</b> Určuje kritérium, podle kterého systém vybírá nejvýhodnějšího dodavatele.',
                type: 'radio',
                name: 'procurementStrategy',
                options: [
                    { value: 'SPLIT_BALANCED', title: 'Vyvážená strategie (Doporučeno)', desc: 'Upřednostňuje hlavního dodavatele s nejnižší cenou. Pokud nemá dostatek kusů, automaticky rozdělí nákup na záložního partnera.', checked: true },
                    { value: 'FASTEST', title: 'Nejrychlejší doručení', desc: 'Vybírá dodavatele s nejkratší dodací lhůtou bez ohledu na drobný cenový rozdíl.' },
                    { value: 'CHEAPEST', title: 'Nejnižší nákupní cena', desc: 'Maximalizuje obchodní marži výběrem nejlevnější velkoobchodní nabídky.' },
                ],
            },
            {
                title: '2. Rozdělení nákupu mezi více dodavatelů',
                desc: '<b>Co toto nastavení ovlivňuje:</b> Co dělat, když žádný jednotlivý partner nemá celé požadované množství.',
                type: 'checkbox',
                id: 'setting-allow-split',
                label: '<b>Povolit automatické rozdělení nákupu mezi více partnerů</b> (pokud hlavní dodavatel nemá skladem všechny kusy, doobjedná zbytek u záložního partnera)',
                checked: true,
            },
            {
                title: '3. Schvalovací proces nákupů',
                desc: '<b>Co toto nastavení ovlivňuje:</b> Zda má systém vyžadovat vaše ruční potvrzení před odesláním podkladů dodavateli.',
                type: 'checkbox',
                id: 'setting-require-approval',
                label: '<b>Vždy vyžadovat ruční schválení e-shopařem před odesláním nákupu</b>',
                checked: true,
            },
        ],
        saveBtn: { id: 'btn-save-settings', label: '✓ Uložit nastavení nákupních pravidel' },
    },
    feeds: {
        eyebrow: 'FEEDY',
        title: 'DATOVÉ FEEDY OD DODAVATELŮ',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Správa datových feedů od dodavatelů — aktuální zboží, ceny a dostupnost.' },
            { label: '👉 CO MÁTE UDĚLAT', text: 'Přidejte nový feed od dodavatele a namapujte jeho pole na AIE systém.' },
        ],
        section: {
            title: 'FEEDY DODAVATELŮ',
            subtitle: 'Přehled připojených datových zdrojů pro kontrolu zboží a cen:',
            action: { id: 'btn-add-feed-dialog', label: '+ Přidat nový feed' },
            contentId: 'feeds-list',
            contentClass: 'stack-list',
        },
    },
    carriers: {
        eyebrow: 'DOPRAVCI',
        title: 'PŘEPRAVNÍ SLUŽBY',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Správa přepravních služeb a jejich vazby na objednávky.' },
            { label: '👉 CO MÁTE UDĚLAT', text: 'Nastavte dopravce a jejich služby pro expedici objednávek.' },
        ],
        section: {
            title: 'DOPRAVCI',
            subtitle: 'Připojené přepravní služby pro expedici objednávek:',
            action: { id: 'btn-add-carrier-dialog', label: '+ Přidat dopravce' },
            contentId: 'carriers-list',
            contentClass: 'stack-list',
        },
    },
    rules: {
        eyebrow: 'PRAVIDLA',
        title: 'AUTOMATIZAČNÍ PRAVIDLA',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Nastavení obchodních pravidel, podle kterých AIE autonomně rozhoduje.' },
            { label: '👉 CO MÁTE UDĚLAT', text: 'Definujte pravidla pro výběr dodavatele, schválení nákupu a expedici.' },
        ],
        section: {
            title: 'AUTOMATIZAČNÍ PRAVIDLA',
            subtitle: 'Pravidla řídící autonomní rozhodování AIE:',
            action: { id: 'btn-add-rule-dialog', label: '+ Přidat pravidlo' },
            contentId: 'rules-list',
            contentClass: 'stack-list',
        },
    },
    stats: {
        eyebrow: 'STATISTIKY & KPI',
        title: 'VÝKONNOST SKLADU, BALENÍ A SKLADNÍKŮ',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Přehledné statistiky výkonnosti skladu a skladníků — kdo, kolik balíků, v jaké váze a za jaký čas zabalil.' },
            { label: '👁️ PROČ TO VIDÍTE', text: 'Podklad pro vyhodnocování KPI, bonusů a optimalizace procesů na pracovní stanici.' },
        ],
        section: {
            title: 'STATISTIKY BALENÍ & SKLADOVÉ KPI',
            subtitle: 'Výkonnost obsluhy za dnešní směnu:',
            contentId: 'stats-kpi-container',
        },
    },
    pickups: {
        eyebrow: 'SVOZY DOPRAVCŮ',
        title: 'AUTOMATICKÉ ČASOVÉ HARMONOGRAMY SVOZŮ',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Automatické Objednávání Svozů — každý dopravce má nastavený jiný čas příjezdu kurýra.' },
            { label: '⚡ CO SE STANE', text: 'Jakmile nastane čas svozu, AIE sama uzavře zásilky a pošle objednávku svozu do systému dopravce.' },
        ],
        section: {
            title: 'ČASOVÝ HARMONOGRAM SVOZŮ ZÁSILEK',
            subtitle: 'Nastavení časů automatického objednání svozu pro jednotlivé kurýrní služby:',
            contentId: 'pickup-schedule-container',
        },
    },
    audit: {
        eyebrow: 'AUDIT',
        title: 'KOMPLETNÍ PROTOKOL SYSTÉMU',
        context: [
            { label: '📌 CO SE DĚJE', text: 'Kompletní audit všech rozhodnutí AIE — co proběhlo, proč a kdy.' },
        ],
        section: {
            title: 'KOMPLETNÍ AUDIT',
            subtitle: 'Všechny akce systému s časy a zdůvodněním:',
            contentId: 'audit-list',
            contentClass: 'audit-empty',
            contentText: 'Audit se bude plnit s postupem akcí v systému.',
        },
    },
};

export const UI_STATIC = {
    feeds: [
        { tag: 'AKTIVNÍ DATOVÝ FEED', title: 'HELIKON-TEX WHOLESALE', url: 'https://helikon-tex.com/export/catalog.xml', status: 'ready', statusLabel: '✓ Synchronizováno', meta: '4 234 položek · Každou hodinu', variant: 'success' },
        { tag: 'AKTIVNÍ DATOVÝ FEED', title: 'BRANDIT CZ', url: 'https://brandit.cz/feed/wholesale.xml', status: 'ready', statusLabel: '✓ Synchronizováno', meta: '1 820 položek · Každé 4 hodiny', variant: 'success' },
        { tag: 'VÝPADEK FEEDU', tagClass: 'item-tag--danger', title: 'MIL-TEC WHOLESALE', error: '⚠️ Poslední synchronizace selhala — zkontrolujte URL nebo API klíč dodavatele.', status: 'warning', statusLabel: '⚠ Chyba', variant: 'danger', actions: ['restore', 'delete'] },
    ],
    carriers: [
        { tag: 'PŘEPRAVNÍ SLUŽBA', title: 'ZÁSILKOVNA (PACKETA)', desc: 'Nativní API · Sledování zásilek · Výdejní místa CZ/SK · Svoz 14:30', status: 'ready', statusLabel: 'Aktivní', variant: 'info', deleteMsg: 'Zásilkovna byla odstraněna ze seznamu dopravců.' },
        { tag: 'PŘEPRAVNÍ SLUŽBA', title: 'DPD CZ (BALÍKOBOT)', desc: 'Balíkobot API · Doručení do 24h · Svoz 16:00', status: 'ready', statusLabel: 'Aktivní', variant: 'info', deleteMsg: 'DPD CZ byl odstraněn ze seznamu dopravců.' },
        { tag: 'PŘEPRAVNÍ SLUŽBA', title: 'PPL CZ (GO BALÍK)', desc: 'GO Balík API · Doručení do 24h · Svoz 17:15', status: 'ready', statusLabel: 'Aktivní', variant: 'info', deleteMsg: 'PPL CZ byl odstraněn ze seznamu dopravců.' },
    ],
    rules: [
        { tag: 'AUTOMATIZAČNÍ PRAVIDLO · AKTIVNÍ', title: 'UPŘEDNOSTNIT NEJLEVNĚJŠÍHO DODAVATELE', desc: '<b>Podmínka:</b> Více dodavatelů skladem · <b>Akce:</b> Objednat u dodavatele s nejnižší nákupní cenou' },
        { tag: 'AUTOMATIZAČNÍ PRAVIDLO · AKTIVNÍ', title: 'AUTOMATICKY SCHVÁLIT NÁKUP POD 10 000 KČ', desc: '<b>Podmínka:</b> Celková hodnota nákupu &lt; 10 000 Kč · <b>Akce:</b> Okamžitě odeslat objednávku dodavateli bez schvalování' },
        { tag: 'AUTOMATIZAČNÍ PRAVIDLO · AKTIVNÍ', title: 'SPLIT OBJEDNÁVKY MEZI 2 DODAVATELE PŘI VÝPADKU SKLADU', desc: '<b>Podmínka:</b> Primární dodavatel nemá dostatek zboží · <b>Akce:</b> Rozdělit nákup mezi dodavatele podle priority' },
    ],
};

export const UI_MODALS = {
    order: { eyebrow: 'DETAIL OBJEDNÁVKY', closeId: 'modal-close-btn' },
    config: { eyebrow: 'NASTAVENÍ', closeId: 'config-modal-close' },
    feed: { eyebrow: 'PŘIPOJENÍ NOVÉHO ZDROJE DAT', title: 'Průvodce přidáním feedu', closeId: 'feed-modal-close-btn' },
    carrier: { eyebrow: 'PŘEPRAVNÍ SLUŽBY', title: 'Přidat dopravce', closeId: 'carrier-modal-close-btn' },
    rule: { eyebrow: 'AUTOMATIZACE NÁKUPU', title: 'Nové automatizační pravidlo', closeId: 'rule-modal-close-btn' },
};

export const UI_LABELS = {
    empty: {
        pendingAll: 'Všechny nákupy jsou schválené. Žádné objednávky nečekají.',
        exceptionsNone: 'Žádné výjimky. Vše běží v pořádku.',
        readyNone: 'Žádné objednávky nečekají na zabalení.',
        exceptionsResolved: 'Všechny výjimky jsou vyřešené!',
        ordersNoMatch: 'Žádné objednávky neodpovídají vyhledávání nebo filtru.',
    },
    buttons: {
        approveAll: '✓ Schválit všechny',
        approvePo: '✓ Schválit nákup u',
        resolveException: '🔍 Zvolit náhradníka / Korigovat deficit',
        printLabel: '🖨️ Vytisknout štítek',
        ship: '📦 Expedovat',
        receiveGoods: '📥 Potvrdit příjem balíku & Automaticky přiřadit k objednávkám',
        delete: '🗑 Smazat',
        restore: '↺ Obnovit',
    },
    table: {
        orderId: 'Číslo objednávky',
        customer: 'Zákazník',
        items: 'Co zákazník objednal',
        allocated: 'Alokováno z vlastního skladu',
        totalStock: 'Celková fyzická zásoba',
        shortage: 'Co chybí',
        shipDate: 'Kdy lze vyřídit',
        status: 'Stav vyřízení',
        actions: 'Akce',
    },
};

export function getViewMeta(viewName) {
    const v = UI_VIEWS[viewName] || UI_VIEWS.dashboard;
    return { eyebrow: v.eyebrow, title: v.title };
}
