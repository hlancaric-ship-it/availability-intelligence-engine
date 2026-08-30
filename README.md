# Automatic Procurement Engine 2.0

Platformově nezávislé jádro pro doplnění zákaznických objednávek, které nejsou pokryté vlastním skladem. Shoptet je adaptér, nikoli součást doménové logiky; stejný engine lze konfigurovat pro ZP Florence i cistytriko.cz bez zákaznických výjimek.

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
- `src/platform/shoptet/` je **strictly read-only**: používá pouze GET pro orders, products a stocks. Nemá žádnou metodu ani importní výstup, který by zapisoval do Shoptetu.
- `migrations/001_procurement_core.sql` je PostgreSQL baseline pro nabídky, PO a jejich řádky.
- Původní `src/core/availability/` a Shoptet priority pipeline zůstaly beze změny funkčního chování.

Konfigurace tenantu drží integraci a politiku mimo jádro, např. `{ approvalMode: 'automatic', speedWeight: 15 }`. Konkrétní endpointy, přihlašovací údaje a formát dodavatelského feedu patří do příslušných implementací portů.

## Oddělené domény

ePoukazy/eRecept nejsou procurement ani skladová alokace. Mají být samostatný modul s vlastním autorizovaným workflow; jádro je proto neinterpretuje ani nehardcoduje.

## Ověření

```bash
npm run typecheck
npm test
```

## Co je nutné před produkcí

Tento repozitář neobsahuje běžící službu ani přihlašovací údaje. `ShoptetReadOnlyClient` používá pouze read token a GET; před nasazením je nutné dodat tenant secrets a mapování reálných Shoptet payloadů. Je také nutné připojit PostgreSQL transakční adapter, spustit migraci, nakonfigurovat dodavatelské feedy/odesílání PO, worker pro scheduled no-API import, interní endpoint dashboardu, observabilitu a provozní alerty.
