# Availability Intelligence Engine (AIE) 2.0

Deterministické, platformově nezávislé jádro pro e-commerce dostupnost, automatizovaný nákup a inteligentní kompletaci objednávek. Shoptet je adaptér, nikoli součást doménové logiky; stejný engine je konfigurovatelný pro ZP Florence, cistytriko.cz i další e-shopy bez výjimek v core logice.

---

## 🚀 Hlavní konkurenční výhody a přednosti AIE (proč je AIE silnější než staré Brani)

### 1. Autonomní Multi-Supplier Split (Chytré rozdělení nákupu)
* **Brani**: Když dodavatel nemá celé požadované množství, e-shopař musel problém řešit ručně.
* **AIE**: Engine automaticky rozdělí deficit mezi více dodavatelů (např. 4 ks u primárního partnera + 2 ks u záložního), aby byla zákaznická objednávka kompletní v nejkratším možném čase.

### 2. Čtyřkrokový verifikační model kompletace balíků
* **Striktní FIFO alokace**: Doručené zboží se nepřiřazuje náhodně, ale striktně nejstarším čekajícím objednávkám.
* **Pípací kontrola skenerem**: Nativní podpora ručních i stacionárních skenerů čárových kódů (EAN/SKU) pro příjem i zabalení. Při špatném pípnutí položky vydá systém varování.
* **Zámek proti neúplné expedici (Safety Lock)**: Tisk štítku a tlačítko expedice se odemknou AŽ ve chvíli, kdy je objednávka 100% naskladněna a spárována.

### 3. 100% Vysvětlitelný Audit Trail & Bezpečná nákupní politika
* **Kompletní příběh vyřízení**: Každá objednávka obsahuje auditní časovou osu s přesným zdůvodněním všech automatických rozhodnutí systému (proč byl vybrán daný dodavatel, jaké byly termíny ETA a marže).
* **Idempotence & Ochrana před spammováním dodavatelů**: Zámky stavů a distribuovaná idempotence garantují, že systém nikdy neodešle duplicitní nákupní seznamy stejnému dodavateli.

### 4. Automatizovaný provoz bez nutnosti REST API
* AIE podporuje plně automatický **NO-API režim** (automatický parsing e-mailových CSV/XML exportů ze Shoptetu + generování unifikovaných podkladů pro dodavatele + bezkontaktní zápis poznámek a stavů do administrace e-shopu).

### 5. Hromadné operace na 1 klik (Bulk Actions)
* Hromadný tisk štítků, hromadná expedice kompletních balíků a hromadné schvalování nákupů dodavatelům.

---

## Co jádro dělá

1. Z kanonických řádků objednávek spočítá skutečný deficit (`quantity - ownStockQuantity`).
2. U každého deficitu vyžaduje přesnou shodu produktu **i varianty** a porovná aktivní nabídky více dodavatelů.
3. Hodnotí cenu, dodací lhůtu a volitelnou prioritu dodavatele. Kapacitu nabídky rezervuje v rámci běhu, aby ji nepřeprodalo více objednávek.
4. Seskupí řádky do jedné nákupní objednávky pro dodavatele a nastaví `PENDING_APPROVAL` nebo `SENT` podle politiky tenantu.
5. Při příjemce alokuje maximálně přijaté a objednané množství zpět na původní řádek zákaznické objednávky.

Nedostupné položky nejsou potichu zahozeny: výsledek obsahuje `NO_SUPPLIER_OFFER` nebo `INSUFFICIENT_SUPPLIER_STOCK`.

## Architektura

```text
Commerce platform (API nebo import) --> CommercePlatformPort --> ProcurementEngine
Supplier catalogue/feed ----------------> SupplierCatalogPort ----^        |
Supplier order sender / repository -----> PurchaseOrderPort <--------------+
Receipt --> allocations --> internal READY-TO-SHIP state
```

- `src/core/procurement/` je čisté deterministické doménové jádro.
- `src/core/procurement/ports.ts` odděluje platformu, katalog dodavatelů a odesílání/persistenci.
- `src/platform/shoptet/` je **strictly read-only**: používá pouze GET pro orders, products a stocks.
- `migrations/001_procurement_core.sql` je PostgreSQL baseline pro nabídky, PO a jejich řádky.

## Ověření

```bash
npm run typecheck
npm test
```

## Co je nutné před produkcí

Tento repozitář neobsahuje běžící službu ani přihlašovací údaje. `ShoptetReadOnlyClient` používá pouze read token a GET; před nasazením je nutné dodat tenant secrets a mapování reálných Shoptet payloadů. Je také nutné připojit PostgreSQL transakční adapter, spustit migraci, nakonfigurovat dodavatelské feedy/odesílání PO, worker pro scheduled no-API import, interní endpoint dashboardu, observabilitu a provozní alerty.
