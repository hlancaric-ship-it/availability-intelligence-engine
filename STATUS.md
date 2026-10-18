# Stav projektu – L-Code Chytrý nákupčí

Tento soubor nahrazuje dřívější `FINAL_STATUS.md`, který uváděl stav „production ready“ a funkce,
které v kódu nejsou. Přehled níže odpovídá skutečnému obsahu repozitáře.

## ✅ Hotové a pokryté testy

| Oblast | Kde |
|---|---|
| Plánování nákupu, sdílený vlastní sklad, žádný dvojí nákup | `src/core/procurement/ProcurementEngine.ts` |
| Kontrola platby (zaplaceno / dobírka), nastavitelná pro každý e-shop | `src/core/procurement/PaymentGate.ts` |
| Výběr dodavatele, rozdělení mezi více dodavatelů | `src/core/procurement/SupplierSelectionEngine.ts` |
| Průběh nákupu: plán → odeslání → stav u dodavatele → příjem → přiřazení | `src/core/procurement/Workflow.ts` |
| Idempotence a audit, oddělení dat e-shopů | `src/platform/persistence/`, `migrations/` |
| Prodejní jednotky, převody, zálohy na obaly | `src/core/sales-units/` |
| Dostupnost a řazení produktů | `src/core/availability/`, `src/core/ranking/` |
| Shoptet: čtení přes API (jen GET, limity 429/503), normalizace exportu | `src/platform/shoptet/` |
| Dodavatelé: obecný API klient, CSV bez API | `src/platform/suppliers/` |
| Sklad a expedice: bezpečnostní zámek (kompletnost + platba), stavy až po „odesláno“ | `src/core/fulfillment/FulfillmentEngine.ts` |
| Balení skenerem (EAN/SKU, špatný produkt, kus navíc), příjem zboží skenerem (fronta od nejstaršího nákupu) | `src/core/fulfillment/` |
| `markReadyToShip`, ověření platby u platformy před balením a odesláním, audit | `src/core/fulfillment/FulfillmentService.ts` |
| Hromadné akce: odeslat vybrané objednávky, schválit vybrané nákupy | `FulfillmentService.shipMany`, `ProcurementWorkflow.approvePurchaseOrders` |
| Databáze skladu s ochranou proti souběžné úpravě | `migrations/005_fulfillment.sql`, `src/platform/persistence/PostgresFulfillmentRepository.ts` |

| HTTP API administrace (přehled, audit, sklad, nákup), validace, idempotence | `src/platform/http/AdminApi.ts` |
| Obecné rozhraní platformy, směrování plateb podle platformy e-shopu | `src/core/platform/PlatformAdapter.ts` |
| Instalace / odinstalace se smazáním všech dat (obecně), šifrované tokeny | `src/platform/operations/TenantLifecycle.ts`, `EncryptedPostgresCredentialsStore.ts` |
| Plánovač (Cron Triggers), běh na Cloudflare Workers + Hyperdrive | `src/platform/operations/Scheduler.ts`, `src/platform/cloudflare/backend.ts` |

## ❌ Chybí – blokuje ostrý provoz a zveřejnění doplňku

| Bod | Co chybí |
|---|---|
| S1 | Skutečné přihlášení do administrace (každý e-shop vidí jen svá data). |
| I1 | Shoptet adaptér: výměna OAuth kódu za token (obecná instalace, šifrované uložení a smazání dat už jsou hotové). |
| I2 | Shoptet adaptér: ověření podpisu webhooků (obecné zpracování webhooků už je hotové). |
| I3 | Administrace napojená na skutečná data (dnes je `frontend/nexustp` jen demo s ukázkovými daty). |
| – | Převod stavu platby ze Shoptetu (API i CSV) do `PaymentInfo`. Bez něj se z bezpečnostních důvodů nic nenakoupí. |
| – | Adaptér platformy pro `PaymentStatusPort` (čerstvý stav platby ze Shoptetu) a pro načtení objednávek do skladu (`FulfillmentService.upsertOrder`, včetně EAN). |
| – | Zápis zpět do e-shopu (stavy objednávek, sklad). `ShoptetOutboundSync` je zatím jen simulace. |
| – | Provozní nasazení: vytvořit databázi a Hyperdrive, nastavit tajné klíče, alerty nad Workers Logs. |

## 🟡 Známé nedostatky

| Bod | Popis |
|---|---|
| K8 | Částky se počítají v desetinných číslech (riziko zaokrouhlovacích chyb). |
| K9 | Kontrola množství u prodejních jednotek. |
| K10 | Vazba pravidel zálohy na správný e-shop. |

## Co v demu je, ale v backendu ne

Demo (`/nexustp`) ukazuje skenování, tisk štítků, hromadné akce, dopravce, feedy a pravidla s ukázkovými daty.
Backend pro skenování, zámek expedice a hromadné akce už existuje (viz výše), ale **demo na něj zatím není napojené**
(HTTP API a přihlášení – krok 2 a 3). Štítky a dopravci backend zatím nemají.
