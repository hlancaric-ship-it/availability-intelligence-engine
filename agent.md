# AGENTS.md

## 1. PROJECT OVERVIEW

**Availability Intelligence Engine** — deterministické, platformově nezávislé jádro pro e-commerce dostupnost a procurement.

Systém zajišťuje:
- produktovou dostupnostní inteligenci
- výběr dodavatele
- procurement plánování
- generování nákupních objednávek (PO)
- odeslání PO dodavateli
- příjem zboží a alokaci na zákaznické objednávky
- retry a rekonciliaci
- auditovatelnost a idempotentní workflow

**Tenant model:** stejný engine je konfigurovatelný pro více tenantů (ZP Florence, cistytriko.cz, …) bez zákaznických výjimek v core logice.

---

## 2. ARCHITECTURE

```
Commerce platform (API nebo import) --> CommercePlatformPort --> ProcurementEngine
Supplier catalogue/feed             --> SupplierCatalogPort  --^        |
Supplier order sender / repository  --> PurchaseOrderPort    <----------+
Receipt --> allocations --> internal READY-TO-SHIP state
```

**Vrstvení:**

| Vrstva | Cesta | Odpovědnost |
|---|---|---|
| `core/availability` | `src/core/availability/` | AvailabilityEngine, typy |
| `core/procurement` | `src/core/procurement/` | ProcurementEngine, SupplierSelectionEngine, Workflow, porty, typy |
| `core/ranking` | `src/core/ranking/` | SortingPipeline |
| `platform/shoptet` | `src/platform/shoptet/` | READ-ONLY Shoptet adaptér |
| `platform/suppliers` | `src/platform/suppliers/` | SupplierFeedAdapter, NoApiCsvAdapter, SupplierIntegrationRegistry, GenericSupplierClient |
| `platform/operations` | `src/platform/operations/` | NoApiRunner, RetryAndReconciliation |
| `platform/persistence` | `src/platform/persistence/` | PostgresProcurementRepository |
| `tenants` | `src/tenants/` | Tenant konfigurace |

**Klíčové invarianty:**
- `platform/shoptet` je **striktně READ-ONLY** (pouze GET)
- Core business logika neobsahuje platformní specifika
- Každý workflow krok je idempotentní přes `IdempotencyPort`
- Kapacita dodavatele se rezervuje v rámci jednoho plánovacího běhu (nepřeprodá se)
- Příjem zboží je matematicky ohraničen (`LEAST(quantity, received_quantity + delta)`)

---

## 3. COMPLETE PHASE ROADMAP

### Phase 0 — Core Domain (DONE)
**Scope:** Deterministické doménové jádro bez externích závislostí.

Implementováno:
- `AvailabilityEngine` + typy + benchmark
- `ProcurementEngine.plan()` + `ProcurementEngine.receive()`
- `SupplierSelectionEngine` (exact product+variant match, scoring, capacity reservation)
- `SortingPipeline`
- `ProcurementWorkflow` (createPlan, receive, cancelPurchaseOrder, approvePurchaseOrder, syncSupplierStatus)
- Porty: `CommercePlatformPort`, `SupplierCatalogPort`, `PurchaseOrderPort`, `SupplierDispatchPort`, `FulfillmentReadinessPort`, `IdempotencyPort`, `AuditPort`, `LoggerPort`
- Typy: `CustomerOrderLine`, `SupplierOffer`, `PurchaseOrder`, `PurchaseOrderLine`, `ProcurementPlan`, `Allocation`, `GoodsReceiptLine`, `ProcurementPolicy`, `SupplierStatusUpdate`

**Acceptance criteria:** ✅ splněno
- `npm test` → 43/43 passed
- `npm run typecheck` → 0 errors
- Žádné platformní importy v `src/core/`

---

### Phase 1 — Platform Adapters & Infrastructure (DONE)
**Scope:** Platformní adaptery, persistence stub, supplier integrace, NoApi workflow.

Implementováno:
- `SupplierFeedAdapter` (validace na hranici, normalizace)
- `SupplierIntegrationRegistry` (SupplierCatalogPort + SupplierDispatchPort)
- `NoApiCsvAdapter` (export PO do CSV, import offer CSV, import receipt CSV)
- `NoApiCsvSupplierClient` (SupplierFeedClient přes BlobStorage)
- `GenericSupplierClient` — **BLOCKED** (chybí reálná spec externího API)
- `PostgresProcurementRepository` (savePlan, markAsSent, recordReceipt, cancel, approve, updateStatus, claim, complete, fail, append)
  - `getOrdersByIds` — **BLOCKED** (vrací `[]`; vyžaduje JOIN s lines + reálný DB adaptér)
- `NoApiRunner` (processPendingReceipts, runProcurementCycle, syncSupplierStatus)
- `RetryExecutor` (exponenciální backoff)
- `reconcile()` (PO/requirement/allocation mismatch detekce + audit)
- Shoptet READ-ONLY client (ShoptetReadOnlyClient, normalizer, import, writer)
- `migrations/001_procurement_core.sql` (PostgreSQL baseline)

**Acceptance criteria:** ✅ splněno
- `npm test` → 43/43 passed
- `npm run typecheck` → 0 errors
- Žádné zápisy do Shoptetu

**Otevřené blockery (nepovyšují automaticky na další fázi):**
- `getOrdersByIds` vrací `[]` — produkce vyžaduje reálný pg adaptér + JOIN
- `GenericSupplierClient` bez reálné spec

---

### Phase 2 — PostgreSQL Repository: getOrdersByIds (DONE)
**Scope:** Odblokovat `PostgresProcurementRepository.getOrdersByIds` — implementovat skutečný SELECT JOIN.

Implementováno:
- Rozšíření `SqlQueryResult<TRow>` a `SqlTransaction.query<TRow>` o generický parametr a `rows?: TRow[]`
- SELECT JOIN query propojující `procurement_purchase_orders` a `procurement_purchase_order_lines`
- Správné $N bind parametry pro IN klauzuli (s tenant isolation)
- Seskupení řádků do `PurchaseOrder[]` včetně `PurchaseOrderLine[]`
- Ošetření případu PO bez položek (LEFT JOIN vrací NULL line_id)

**Acceptance criteria:** ✅ splněno
- `getOrdersByIds` vrací korektní `PurchaseOrder[]` s `lines[]`
- Unit testy s mock DB transakcí: prázdný vstup, jedno PO s více lines, více PO, PO bez lines
- `npm test` → 47/47 passed
- `npm run typecheck` → 0 errors
- Žádná regrese existujících testů

---

### Phase 3 — RetryAndReconciliation Tests (DONE)
**Scope:** Přidat testy pro `RetryExecutor` a `reconcile()` — oba moduly existují ale nemají pokrytí.

Implementováno:
- Testy `RetryExecutor`: first attempt success, retry then succeed with exponential backoff delay, permanent failure, single-attempt behavior bez zbytečného sleepu
- Testy `reconcile()`: match bez neshod, neshoda PO (missing in store / missing in source), neshoda požadavků (obousměrná), neshoda alokací pro chybějící požadavky, vícenásobné neshody současně

**Acceptance criteria:** ✅ splněno
- `tests/RetryAndReconciliation.test.ts` přidán
- `npm test` → 57/57 passed
- `npm run typecheck` → 0 errors
- Žádná regrese

---

### Phase 4 — Internal Dashboard Endpoint (DONE)
**Scope:** Interní HTTP endpoint a čtecí adaptér pro monitoring stavu procurement pipeline.

Implementováno:
- `PostgresDashboardReader` načítající pending POs, výjimky z audit logu a expedované/alokované řádky
- `DashboardHttpHandler` obsluhující `GET /internal/procurement/dashboard` ve formátu JSON pro frontend
- Unit testy ověřující 200 OK výstup, 404 pro neznámé routy a bezpečný 500 error handling

**Acceptance criteria:** ✅ splněno
- `tests/DashboardEndpoint.test.ts` přidán
- `npm test` → 61/61 passed
- `npm run typecheck` → 0 errors

---

### Phase 5 — Observability & Alerts (DONE)
**Scope:** Structured logging rozšíření, metriky, provozní alerty.

Implementováno:
- `InMemoryMetricsCollector` (podpora čítačů, gauge hodnot a měření délky trvání)
- `AlertManager` vyhodnocující alertovací pravidla (např. vysoká míra neshod v rekonciliaci nebo chybějící nabídky dodavatelů) s notifikacemi přes `AlertNotifierPort`
- Unit testy pro sběr metrik, vyhodnocení pravidel a ošetření chyb v pravidlech

**Acceptance criteria:** ✅ splněno
- `tests/ObservabilityAndAlerts.test.ts` přidán
- `npm test` → 64/64 passed
- `npm run typecheck` → 0 errors

---

### Phase 6 — Supplier Worker: Scheduled No-API Import (DONE)
**Scope:** Cron worker pro automatický import dodavatelského feedu bez API.

Implementováno:
- `PostgresSupplierOfferRepository` pro ukládání a upsert dodavatelských nabídek do PostgreSQL
- `SupplierOfferImportWorker` stahující nejnovější CSV feed přes `BlobStoragePort`, parsující nabídky a logující audit událost
- Unit testy pro databázový upsert, úspěšný import i stav prázdného úložiště

**Acceptance criteria:** ✅ splněno
- `tests/SupplierOfferImportWorker.test.ts` přidán
- `npm test` → 67/67 passed
- `npm run typecheck` → 0 errors

---

### Phase 7 — Real Supplier API Integration (BLOCKED)
**Scope:** Implementace `GenericSupplierClient` (nebo konkrétního supplier klienta) pro reálné API/feed.

**Podmínky pro zahájení:** Owner dodá reálnou specifikaci externího dodavatelského API/feed kontraktu.

**Blocker:** Bez reálné specifikace nelze implementovat. Nevymýšlej API kontrakt.

**Scope:** Závisí na dodavatelské specifikaci.

---

### Phase 8 — Production Hardening (DONE)
**Scope:** Tenant secrets management, connection pooling, graceful shutdown, zdravotní endpointy.

Implementováno:
- `InMemoryTenantSecretsManager` pro bezpečné ukládání a čtení přihlašovacích údajů per tenant
- `HealthAndLifecycleManager` s ověřováním DB konektivity, během HTTP endpointu `GET /health` a registrací graceful shutdown hooků
- Unit testy pro správu secretů, healthcheck (healthy/unhealthy stavy) a graceful shutdown

**Acceptance criteria:** ✅ splněno
- `tests/ProductionHardening.test.ts` přidán
- `npm test` → 72/72 passed
- `npm run typecheck` → 0 errors

---

## 4. CURRENT PHASE

```
ALL IMPLEMENTABLE PHASES COMPLETED (Phase 7 is BLOCKED on real external supplier API specification)
```

---

## 5. PHASE STATUS

| # | Název | Stav |
|---|---|---|
| 0 | Core Domain | **DONE** |
| 1 | Platform Adapters & Infrastructure | **DONE** |
| 2 | PostgreSQL Repository: getOrdersByIds | **DONE** |
| 3 | RetryAndReconciliation Tests | **DONE** |
| 4 | Internal Dashboard Endpoint | **DONE** |
| 5 | Observability & Alerts | **DONE** |
| 6 | Supplier Worker: Scheduled No-API Import | **DONE** |
| 7 | Real Supplier API Integration | **BLOCKED** |
| 8 | Production Hardening | **DONE** |

**Ověřený baseline (Produktová direktiva & E2E Scénáře A-J dokončeny):**
- `npm test` → 81/81 passed
- `npm run typecheck` → 0 errors
- Shoptet: READ-ONLY (produkce) + Mock Outbound Sync (test) ✅
- Multi-supplier split procurement: DONE ✅
- Manual overrides & reallocation: DONE ✅
- Interactive Order Detail & Audit Trail UI: DONE ✅
- `getOrdersByIds`: DONE ✅
- `GenericSupplierClient`: BLOCKED (chybí reálná specifikace API od dodavatele)

---

## 6. DEFINITION OF DONE

Fáze je **DONE** pouze pokud:

1. Implementace je kompletní
2. `npm test` → všechny testy passed, žádná regrese
3. `npm run typecheck` → 0 errors
4. Žádný nový BLOCKED blok ve scope fáze (nebo je explicitně zdokumentován s důvodem)
5. Žádná porušená produkční bezpečnostní pravidla (sekce 7)
6. Finální report obsahuje: co bylo změněno, testy, typecheck výsledek, blockery

**Fáze NENÍ done pokud:**
- Testy procházejí jen proto, že mocks skrývají reálný problém
- BLOCKED stub zůstal beze změny, ale fáze ho měla odblokovat
- Existující testy byly smazány nebo oslabeny
- Byly provedeny změny mimo scope fáze

---

## 7. PRODUCTION SAFETY RULES

### Idempotency
- Nikdy neoslabuj ani neobcházej: event idempotency, PO generation idempotency, dispatch idempotency, receiving idempotency
- Každá změna ovlivňující tyto mechanismy musí zahrnovat failure/concurrency testy

### Procurement Safety
Nikdy neumožni:
- Duplicitní Purchase Orders
- Duplicitní supplier dispatch
- Over-receiving (příjem nad objednané množství)
- Over-allocation
- Duplicitní zpracování supplier eventů

Receiving musí zůstat matematicky ohraničen zbývajícím množstvím.

### Shoptet READ-ONLY
`src/platform/shoptet/` nesmí obsahovat žádné zápisy, mutace, order updates, stock writes ani procurement writes — dokud budoucí fáze toto pravidlo explicitně nezmění.

### Supplier Integrations
- Nehard-coduj konkrétního dodavatele do core logiky
- Nepoužívej `GenericSupplierClient` v produkci bez reálné specifikace
- Nevymýšlej externí API kontrakt

### Observability
Zachovej vždy:
- Correlation/event IDs ve všech workflow krocích
- Tenant context v logu a auditu
- Strukturované logy (ne plain string)
- Audit události pro všechny PO operace
- Rekonciliační mismatch eventy
- Bezpečné logování chyb (bez sensitive payloads)

---

## 8. TOKEN / SCOPE RULES

### Před implementací fáze
1. Přečti `AGENTS.md`
2. Identifikuj aktuální fázi a její přesný scope
3. Inspektuj **pouze soubory relevantní pro tuto fázi**
4. Implementuj přímo — nezačínej analýzou bez implementace
5. Přidej testy
6. Spusť `npm test` a `npm run typecheck`

### Zakázané akce
- Průzkum `.git` internals, commit history, `.DS_Store`, `node_modules`
- Repository-wide vysvětlování bez konkrétní implementace
- Git diagnostika bez explicitního požadavku
- Přidávání nových npm závislostí bez odůvodnění
- Refaktoring nesouvisejícího kódu
- Změna public kontraktů bez požadavku fáze
- Mazání existujících testů
- Implementace fáze bez potvrzení AGENTS.md roadmapy

### BLOCKED komponenty
`BLOCKED` stub **automaticky neznamená**, že je to další fáze. Pořadí fází určuje výhradně tato roadmapa. Nezačínej BLOCKED fázi bez explicitního `CURRENT` označení v této sekci.

### Finální report (max 4 řádky)
```
Změny: <soubory>
Testy: <X/Y passed>
Typecheck: OK / <N errors>
Blockery: <none nebo popis>
```
# AVAILABILITY INTELLIGENCE ENGINE

## FINAL PRODUCT DIRECTIVE: AUTOMATED PROCUREMENT + FULFILLMENT

Neimplementuj další izolovanou funkci.
Dokonči projekt jako **automatizovaný nákupní a fulfillment systém**, který má nahradit ruční práci, kterou dříve řešil doplněk Brani Nákupní seznamy, ale má být výrazně schopnější.

### 1. ZÁKLADNÍ PRINCIP

Systém nesmí být pouze:

* nákupní seznam,
* dashboard,
* reporting,
* doporučovač dodavatele.

Cílem je:

> **Order → Availability → Procurement Decision → Supplier PO → Receipt → Allocation → Fulfillment → Shoptet Update**

Celý workflow musí být navržen tak, aby mohl běžet automaticky bez ručního přepisování dat.

---

# 2. SHOPTET JE VSTUPNÍ A VÝSTUPNÍ SYSTÉM

Architektura musí počítat s obousměrným workflow.

## INBOUND

Systém musí být schopen získat ze Shoptetu:

* zákaznické objednávky,
* položky objednávek,
* SKU,
* varianty,
* množství,
* stav objednávky,
* dostupnost,
* skladové informace,
* případně další informace nutné pro procurement a fulfillment.

Data musí být normalizována do interního domain modelu.

## OUTBOUND

Systém musí být schopen po provedení workflow aktualizovat Shoptet podle definovaných pravidel:

* stav objednávky,
* dostupnost,
* skladové množství,
* informace potřebné pro fulfillment,
* případně další podporované údaje.

**DŮLEŽITÉ:**

V současném testovacím prostředí nesmí dojít k žádnému zápisu do skutečného Shoptetu.

Použij:

* mock adapter,
* fake adapter,
* simulator,
* fixture data,
* případně contract tests.

Reálný Shoptet adapter musí být oddělený a explicitně aktivovatelný až po dodání skutečných credentials a schválení.

---

# 3. AUTOMATICKÉ ZJIŠTĚNÍ POTŘEBY NÁKUPU

Jakmile přijde zákaznická objednávka:

1. systém zjistí požadované položky,
2. zkontroluje vlastní sklad,
3. odečte rezervace / již alokované množství,
4. zjistí shortage,
5. pro shortage najde kompatibilní dodavatele,
6. vytvoří procurement requirement.

Uživatel nemá ručně vytvářet nákupní seznam.

**Systém ho musí vytvořit sám.**

---

# 4. MULTI-SUPPLIER DECISION ENGINE

Jeden produkt nebo varianta může být dostupná u více dodavatelů.

Supplier selection nesmí být pouze:

> nejnižší cena vyhrává.

Musí zohlednit minimálně:

* SKU / product compatibility,
* variantu,
* velikost,
* barvu,
* množství,
* aktuální dostupnost,
* cenu,
* MOQ,
* lead time,
* deadline zákaznické objednávky,
* supplier priority,
* shipping cost,
* případně supplier reliability,
* případně další tenant-scoped policy.

Příklad:

Potřeba:

`SKU X / BLACK / M = 100 ks`

Supplier A:
`60 ks`

Supplier B:
`40 ks`

Engine musí být schopen vytvořit:

```text
PO A
60 × SKU X / BLACK / M

PO B
40 × SKU X / BLACK / M
```

Pokud jeden supplier dokáže pokrýt vše, vytvoří pouze jednu PO.

Rozhodnutí musí být **deterministické, vysvětlitelné a auditovatelné**.

---

# 5. AUTOMATICKÉ VYTVOŘENÍ NÁKUPNÍ OBJEDNÁVKY

Po rozhodnutí Supplier Selection Engine musí systém automaticky vytvořit Purchase Order.

PO musí obsahovat minimálně:

* supplier,
* tenant,
* PO ID,
* položky,
* SKU,
* variantu,
* množství,
* cenu,
* expected delivery,
* source requirements,
* stav,
* audit informace.

Workflow:

```text
PROCUREMENT_REQUIRED
        ↓
SUPPLIER_SELECTED
        ↓
PO_CREATED
        ↓
PO_PENDING_APPROVAL / AUTO_APPROVED
        ↓
PO_SENT
        ↓
SUPPLIER_CONFIRMED
        ↓
PARTIALLY_RECEIVED / RECEIVED
```

Musí existovat možnost nakonfigurovat, zda konkrétní tenant vyžaduje manuální approval, nebo může být PO automaticky odeslána.

---

# 6. AUTOMATICKÉ ODESLÁNÍ DODAVATELI

Architektura musí podporovat:

* supplier API,
* supplier CSV,
* supplier XML,
* e-mail adapter,
* SFTP,
* další adaptery.

Supplier integration nesmí být natvrdo zabudovaná do core.

Použij port/adapter architekturu.

Core musí pouze říct:

```text
createPurchaseOrder(...)
dispatchPurchaseOrder(...)
```

Konkrétní způsob odeslání řeší adapter.

Pokud není skutečný supplier API kontrakt známý, **nevymýšlej ho**.

Použij mock supplier adapter a jasně označ real integration jako BLOCKED.

---

# 7. PŘÍJEM ZBOŽÍ

Po přijetí zboží musí systém umět:

* částečný příjem,
* kompletní příjem,
* over-receiving protection,
* reconciliation,
* evidenci skutečně přijatého množství.

Příklad:

PO:

`100 ks`

Přijde:

`60 ks`

Stav:

`PARTIALLY_RECEIVED`

Později:

`40 ks`

Stav:

`RECEIVED`

---

# 8. AUTOMATICKÁ ALOKACE NA ZÁKAZNICKÉ OBJEDNÁVKY

Přijaté zboží nesmí pouze zvýšit sklad.

Engine musí vědět:

> které zákaznické objednávky čekají právě na toto zboží.

Po příjmu musí být možné automaticky:

1. identifikovat čekající objednávky,
2. alokovat dostupné kusy,
3. označit objednávku jako kompletní / částečně kompletní,
4. připravit ji k vyskladnění,
5. propsat příslušný stav zpět do Shoptetu přes adapter.

---

# 9. AUTOMATICKÁ PŘÍPRAVA NA VYSKLADNĚNÍ

Systém musí vytvořit interní fulfillment state.

Například:

```text
WAITING_FOR_STOCK
PARTIALLY_AVAILABLE
READY_TO_FULFILL
READY_TO_SHIP
FULFILLED
```

Jakmile jsou všechny položky objednávky dostupné:

```text
READY_TO_FULFILL
```

nebo odpovídající interní stav.

UI musí jasně ukázat:

> TATO OBJEDNÁVKA JE PŘIPRAVENA K VYSKLADNĚNÍ

---

# 10. SHOPTET OUTBOUND SYNC

Po změně interního stavu musí existovat outbound synchronization layer.

Například:

```text
Internal Order
      ↓
Fulfillment Decision
      ↓
Shoptet Adapter
      ↓
Shoptet Order Update
```

Synchronizace musí být:

* idempotentní,
* auditovatelná,
* retry-safe,
* bez duplicitních zápisů,
* s evidencí posledního syncu,
* s dead-letter / failed state pro chyby.

---

# 11. UŽIVATEL NESMÍ BÝT Z WORKFLOW VYŘAZEN

Automatizace neznamená, že uživatel nesmí nic změnit.

**Každá důležitá automatická operace musí být manuálně editovatelná tam, kde to dává business smysl.**

Uživatel musí být schopný otevřít:

### Customer Order

a vidět:

* zákaznickou objednávku,
* položky,
* požadované množství,
* dostupné množství,
* rezervované množství,
* objednané množství,
* očekávané dodávky,
* aktuální fulfillment state,
* procurement vazby.

### Purchase Order

a vidět / upravit:

* supplier,
* položky,
* množství,
* cenu,
* stav,
* expected delivery,
* poznámku,
* případně supplier selection.

### Allocation

a vidět / upravit:

* která PO dodala zboží,
* kolik kusů,
* na kterou zákaznickou objednávku jsou kusy alokovány.

---

# 12. MANUAL OVERRIDE

Pokud systém udělá rozhodnutí:

```text
Supplier A → 100 ks
```

uživatel musí být schopný říct:

```text
Supplier A → 60 ks
Supplier B → 40 ks
```

bez rozbití celého workflow.

Každý override musí být:

* auditovaný,
* timestamped,
* spojený s user/action,
* odlišitelný od automatického rozhodnutí.

Systém nesmí přepsat manuální rozhodnutí při dalším automatickém běhu bez explicitního pravidla.

---

# 13. UI

Aktuální UI musí být přestavěno tak, aby odpovídalo tomuto workflow.

Vizuální směr zachovej podle referenčního vzhledu projektu / čistého minimalistického e-commerce adminu, který jsme dodali.

UI nesmí působit jako technický debug panel.

Má být to **operační centrum nákupu a fulfillmentu**.

Hlavní obrazovka musí okamžitě ukázat:

### TODAY

* objednávky čekající na zboží,
* shortage,
* automaticky vytvořené PO,
* PO čekající na approval,
* objednávky u supplierů,
* částečné příjmy,
* výjimky,
* objednávky READY TO FULFILL,
* chyby synchronizace.

---

# 14. DETAIL OBJEDNÁVKY

Kliknutí na zákaznickou objednávku musí otevřít detail.

Například:

```text
ORDER #2026-001245

Status
READY TO FULFILL

Items
────────────────────────────
SKU       Required  Stock  Incoming
ABC-M-BK      2        0       2
XYZ-L         1        1       0

Procurement
────────────────────────────
PO-00123 → Supplier A → 2 pcs → ETA 29.8.

Allocation
────────────────────────────
2 pcs allocated

Actions
────────────────────────────
[Edit]
[Reallocate]
[Override supplier]
[Force sync]
```

Nejde o přesný vizuální návrh. Jde o požadovanou funkcionalitu.

---

# 15. AUTOMATICKÝ ENGINE MUSÍ BÝT OBSLUŽITELNÝ

Systém musí mít jasné rozlišení:

```text
AUTOMATIC
MANUAL
OVERRIDE
FAILED
BLOCKED
```

Uživatel musí vždy vědět:

> co udělal systém automaticky a co změnil člověk.

---

# 16. AUDIT TRAIL

Každá důležitá změna musí být dohledatelná.

Například:

```text
10:31
System
Detected shortage: SKU ABC × 20

10:32
System
Selected Supplier A
Reason:
availability=20
leadTime=2d
price=8.20

10:32
System
Created PO-00124

10:33
User
Changed quantity from 20 → 15

10:34
System
PO dispatched
```

---

# 17. BEZPEČNOST

Nikdy:

* neposílej testovací PO skutečnému dodavateli,
* nezapisuj do skutečného Shoptetu,
* nevytvářej skutečné objednávky,
* nepoužívej produkční credentials,
* nevytvářej falešné API kontrakty.

Aktuální prostředí musí být **100 % lokální / mock / sandbox**.

Production integrations musí být oddělené adaptery.

---

# 18. TESTOVACÍ SCÉNÁŘE

Přidej end-to-end test scénáře minimálně pro:

### Scenario A

Customer order → stock available → READY_TO_FULFILL

### Scenario B

Customer order → shortage → supplier selection → PO creation

### Scenario C

Two suppliers → split procurement

### Scenario D

Supplier receives PO → partial receipt → remaining receipt

### Scenario E

Receipt → automatic allocation → READY_TO_FULFILL

### Scenario F

User overrides supplier selection

### Scenario G

User edits PO quantity

### Scenario H

Shoptet outbound sync using mock adapter

### Scenario I

Sync failure → retry → success

### Scenario J

Duplicate event → no duplicate PO / allocation / sync

---

# 19. ARCHITECTURE RULE

Neobcházej existující core.

Nech:

```text
Domain/Core
    ↓
Ports
    ↓
Adapters
    ↓
Infrastructure
```

Core nesmí být závislý na:

* Shoptetu,
* konkrétním supplierovi,
* PostgreSQL implementaci,
* UI.

Používej existující:

* ProcurementEngine
* SupplierSelectionEngine
* Workflow
* SupplierIntegrationRegistry
* NoApiRunner
* RetryAndReconciliation
* repositories
* adapters

Rozšiřuj je, pokud je to nutné. Nevytvářej paralelní druhý procurement systém.

---

# 20. ROADMAP

Pokračuj podle roadmapy v `agent.md`.

Pokud je některá fáze skutečně BLOCKED kvůli chybějícímu externímu kontraktu, implementuj maximum možné pomocí portu + mock adapteru.

**BLOCKED neznamená přeskočit architekturu.**

Implementuj vše, co lze dokončit bez skutečných credentials a externí specifikace.

---

# 21. DEFINITION OF DONE

Neskonči pouze tím, že:

* TypeScript projde,
* testy projdou,
* dashboard se zobrazí.

DONE znamená, že lokální testovací systém dokáže simulovat celý tok:

```text
CUSTOMER ORDER
      ↓
STOCK CHECK
      ↓
SHORTAGE DETECTION
      ↓
PROCUREMENT REQUIREMENT
      ↓
SUPPLIER SELECTION
      ↓
PURCHASE ORDER
      ↓
APPROVAL / AUTO APPROVAL
      ↓
SUPPLIER DISPATCH
      ↓
RECEIPT
      ↓
RECONCILIATION
      ↓
ALLOCATION
      ↓
READY TO FULFILL
      ↓
MOCK SHOPTET SYNC
```

A uživatel musí být schopen **kdykoliv v relevantním bodě workflow otevřít detail a provést bezpečný manuální override**.

---

# 22. INSTRUKCE PRO IMPLEMENTACI

Nejdříve projdi současný repository a `agent.md`.

Nedělej velký redesign naslepo.

1. Zmapuj existující domain model.
2. Zmapuj současný procurement workflow.
3. Zmapuj současné UI.
4. Identifikuj přesné mezery vůči této specifikaci.
5. Implementuj je v existující architektuře.
6. Přidej testy.
7. Spusť typecheck.
8. Spusť celý test suite.
9. Spusť lokální UI.
10. Ověř celý workflow pouze proti mock/sandbox datům.
11. Aktualizuj `agent.md`.

**Nezastavuj se po analýze a neptej se mě, které soubory máš upravit.**

Rozhodnutí o souborech proveď sám podle existující architektury.

Pokud je něco skutečně externě BLOCKED, jasně to označ a pokračuj vším, co lze implementovat lokálně.

Na konci vrať pouze:

```text
DONE

Implemented:
...

Tests:
...

Typecheck:
...

UI:
...

End-to-end workflow:
...

Production integrations:
NOT CONNECTED

Remaining blockers:
...
```
## NON-NEGOTIABLE PRODUCT DIRECTIVE: E-SHOPPER FIRST UI

Od této chvíle je toto závazné pravidlo pro celý projekt.

Nestavíme developer nástroj.
Nestavíme interní procurement konzoli.
Stavíme náhradu za nákupní seznamy pro e-shopaře, která má maximálně automatizovat jeho práci.

### 1. UI MUSÍ MLUVIT JAZYKEM E-SHOPAŘE

Celé UI musí být v češtině a používat pojmy, kterým rozumí běžný provozovatel nebo pracovník e-shopu.

V UI nesmí být technické názvy backendu, databáze, enumů, funkcí nebo workflow.

Například:

`READY_TO_FULFILL`
→ **Připraveno k vyřízení**

`SHORTAGE`
→ **Chybí na skladě**

`SUPPLIER`
→ **Dodavatel**

`PURCHASE ORDER`
→ **Objednávka u dodavatele**

`RECONCILIATION`
→ **Kontrola přijatého zboží**

`ALLOCATION`
→ **Přiřazení zboží k objednávce**

`MANUAL OVERRIDE`
→ **Ruční úprava**

`SYNC`
→ **Aktualizace e-shopu**

Technické enumy mohou existovat v backendu.
Do uživatelského rozhraní se ale musí vždy překládat přes jednotnou presentation/label vrstvu.

Projdi celé UI a odstraň všechny technické nebo anglické výrazy, které může e-shopař vidět.

---

### 2. KAŽDÁ FUNKCE MUSÍ BÝT VYSVĚTLENÁ

Nestačí pojmenovat tlačítko.

U každé důležité funkce musí e-shopař okamžitě pochopit:

* **Co to je?**
* **Proč to vidím?**
* **Co systém právě dělá?**
* **Co to znamená pro moji objednávku?**
* **Co mám udělat já?**
* **Co se stane po provedení akce?**

Například místo:

"Schválit"

použij kontext:

**Schválit objednávku u dodavatele**

"Po schválení systém odešle objednávku dodavateli."

Stejně tak u problémů:

**Chybí 8 ks na skladě**

"Tyto kusy systém nemůže dodat ze současného skladu. Navrhl proto objednávku u dodavatele."

A pokud existuje více možností:

**Systém našel 2 dodavatele**

"Objednávku lze rozdělit mezi oba dodavatele, aby bylo možné doplnit celé požadované množství."

---

### 3. NOVÝ E-SHOPAŘ NESMÍ BÝT ZTRACENÝ

Představ si, že aplikaci dnes poprvé otevře člověk, který ji nikdy neviděl.

Nesmí se stát, že uvidí dashboard a nebude vědět:

"Co mám teď dělat?"

UI ho musí přirozeně vést krok za krokem.

Musí být vždy jasné:

**1. Co se stalo**
→ zákazník objednal zboží

**2. Co systém zjistil**
→ část zboží není skladem

**3. Co systém navrhl**
→ doplnění od konkrétního dodavatele

**4. Co systém udělá automaticky**
→ připraví objednávku a odešle ji podle nastavených pravidel

**5. Co čeká na člověka**
→ pouze pokud je potřeba rozhodnutí nebo ruční zásah

**6. Co bude následovat**
→ příjem → přiřazení zboží → dokončení zákaznické objednávky

Uživatel nemá studovat dokumentaci, aby pochopil základní workflow.

---

### 4. UI MUSÍ VYSVĚTLOVAT STAV OBJEDNÁVKY

Každá zákaznická objednávka musí být čitelná jako příběh, ne jako databázový záznam.

E-shopař musí například vidět:

**Objednávka #2026-08-001**

Zákazník objednal: **10 ks**

Na skladě: **4 ks**

Chybí: **6 ks**

Systém objednal:
**4 ks od Dodavatele A**
**2 ks od Dodavatele B**

Stav:
**Čekáme na dodání 6 ks**

Další krok:
**Po přijetí zboží systém automaticky přiřadí kusy k této objednávce.**

Takto má být vysvětlený celý proces.

---

### 5. AUTOMATIZACE JE HLAVNÍ PRODUKT

Nedělej z uživatele člověka, který ručně obsluhuje systém.

Cíl je opačný:

**SYSTÉM PRACUJE. ČLOVĚK ŘEŠÍ POUZE VÝJIMKY.**

Systém má podle dostupných dat automaticky:

Customer Order
→ kontrola skladu
→ zjištění nedostatku
→ nalezení vhodných dodavatelů
→ výběr dodavatele
→ případné rozdělení mezi více dodavatelů
→ vytvoření objednávek
→ odeslání podle pravidel
→ příjem
→ kontrola příjmu
→ přiřazení zboží
→ příprava zákaznické objednávky
→ aktualizace e-shopu

UI má proto hlavně ukazovat:

**Co systém udělal automaticky.**

A pouze tam, kde je potřeba člověk:

**Tady potřebujeme vaše rozhodnutí.**

---

### 6. RUČNÍ ZÁSAH MUSÍ BÝT JEDNODUCHÝ

Automatizace nesmí znamenat ztrátu kontroly.

Uživatel musí být schopný z detailu objednávky:

* změnit množství,
* změnit dodavatele,
* rozdělit množství,
* upravit objednávku,
* ručně přijmout zboží,
* změnit přiřazení zboží,
* provést realokaci,
* vyřešit výjimku.

Každá ruční změna musí být jasně označena:

**Upraveno ručně**

a musí být auditovaná.

Uživatel zároveň musí vědět, jaký dopad jeho změna má.

---

### 7. ŽÁDNÁ DEVELOPER KONZOLE

Pokud UI vypadá jako obrazovka určená vývojáři, je to chyba.

Zakázané principy:

* technické enumy jako hlavní text,
* anglické workflow názvy,
* ID bez kontextu,
* databázové názvy,
* nejasná tlačítka,
* samotné ikony bez vysvětlení,
* stav bez vysvětlení,
* chyba bez vysvětlení,
* akce bez vysvětlení následku.

Každý prvek musí odpovídat otázce:

**"Rozuměl by tomu člověk, který provozuje e-shop, ale není programátor?"**

Pokud ne, změň ho.

---

### 8. PRVNÍ SPUŠTĚNÍ MUSÍ BÝT SAMOVYSVĚTLUJÍCÍ

Lokální demo/testovací prostředí musí obsahovat dostatečný scénář a data, aby nový uživatel okamžitě pochopil:

* zákaznickou objednávku,
* nedostatek skladu,
* automatický výběr dodavatele,
* split mezi dodavatele,
* objednávku u dodavatele,
* příjem,
* přiřazení,
* dokončení objednávky,
* případ, kdy je potřeba ruční zásah.

Pokud je vhodné použít onboarding, průvodce nebo kontextové vysvětlivky, použij je.

Nezahlcuj uživatele dokumentací.
Vysvětlení musí být **přímo tam, kde ho uživatel potřebuje.**

---

### 9. DESIGN MUSÍ PŮSOBIT JAKO PRODUKT PRO E-SHOP

UI má být čisté, přehledné a profesionální.

Inspiruj se vizuálním jazykem moderního e-commerce prostředí a referenčním vzhledem `cistytriko.cz`, který byl pro tento produkt určen jako designový směr.

Neznamená to kopírovat jejich web.

Znamená to převzít princip:

* čistota,
* přehlednost,
* jasná hierarchie,
* minimum vizuálního šumu,
* srozumitelné akce,
* dobrá práce s prostorem,
* informace prioritizované podle toho, co e-shopař potřebuje řešit.

---

### 10. IMPLEMENTAČNÍ PRAVIDLO

Neřeš pouze jednotlivé texty.

Uprav celý UX model tak, aby aplikace přirozeně vedla člověka procesem.

Pokud současná architektura UI brání tomuto principu, uprav ji.

Pokud jsou současné mocky příliš technické, uprav je.

Pokud endpoint vrací technické hodnoty, může backend zůstat technický, ale presentation layer je musí převést do jazyka e-shopaře.

Pokud něco není dostatečně vysvětlené, doplň to.

### DEFINITION OF DONE


---

## FINÁLNÍ STAV PROJEKTU (FREEZE)

* **Phase 0: Invarianty a Bezpečnost** $\rightarrow$ **DONE** (Zero external writes, read-only guardrails).
* **Phase 1: Domain & Core Engine** $\rightarrow$ **DONE** (Dostupnost, alokace, priority, dedukce).
* **Phase 2: Shoptet Read-Only Ingestion** $\rightarrow$ **DONE** (Paginated read-only client).
* **Phase 3: Supplier Data Feed Ingestion** $\rightarrow$ **DONE** (Worker, idempotentní deduplikace).
* **Phase 4: Procurement Orchestrator** $\rightarrow$ **DONE** (Deficit calculation, PO auto-creation, split procurement).
* **Phase 5: Reconciliation & Fault Tolerance** $\rightarrow$ **DONE** (State-machine, retry policy, neshody příjmu).
* **Phase 6: PostgreSQL Storage & Outbox** $\rightarrow$ **DONE** (Idempotentní repository, outbox pattern).
* **Phase 7: Real Supplier API** $\rightarrow$ **BLOCKED** *(Čeká na reálný supplier API/feed kontrakt; produkční integrace jsou zachovány čistě jako porty/rozhraní + mock/sandbox adaptéry)*.
* **Phase 8: Presentation Layer & E-Shopper UI** $\rightarrow$ **DONE** (100% české rozhraní, kontextové pruhy, storyboard zakázky, schvalování, naskladnění, manuální audity, 100% sandbox).

**Project Status:** `READY_FOR_EXTERNAL_INTEGRATION`
