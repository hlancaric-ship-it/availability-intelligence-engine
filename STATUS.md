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

## ❌ Chybí – blokuje ostrý provoz a zveřejnění doplňku

| Bod | Co chybí |
|---|---|
| S1 | Skutečné přihlášení do administrace (každý e-shop vidí jen svá data). |
| I1 | Instalace a odinstalace doplňku na platformě (u Shoptetu OAuth, uložení tokenu, smazání dat po odinstalaci). |
| I2 | Webhooky platformy (nové / změněné / zaplacené objednávky). |
| I3 | Administrace napojená na skutečná data (dnes je `frontend/nexustp` jen demo s ukázkovými daty). |
| – | Převod stavu platby ze Shoptetu (API i CSV) do `PaymentInfo`. Bez něj se z bezpečnostních důvodů nic nenakoupí. |
| – | Implementace `FulfillmentReadinessPort.markReadyToShip` (ukládat `tenant_id`, před uvolněním k expedici znovu ověřit platbu). |
| – | Zápis zpět do e-shopu (stavy objednávek, sklad). `ShoptetOutboundSync` je zatím jen simulace. |
| – | Provozní nasazení služby: běh workerů, tajné klíče e-shopů (dnes jen `InMemoryTenantSecretsManager`), monitoring. |

## 🟡 Známé nedostatky

| Bod | Popis |
|---|---|
| K8 | Částky se počítají v desetinných číslech (riziko zaokrouhlovacích chyb). |
| K9 | Kontrola množství u prodejních jednotek. |
| K10 | Vazba pravidel zálohy na správný e-shop. |

## Co v demu je, ale v backendu ne

Demo (`/nexustp`) ukazuje i skenování čárových kódů, tisk štítků, hromadné akce, dopravce, feedy a pravidla.
Tyto části jsou zatím **jen v prezentaci** s ukázkovými daty; backend pro ně neexistuje.
