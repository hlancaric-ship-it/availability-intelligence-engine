# L-Code Chytrý nákupčí

> Backendová služba pro e-shopy, která hlídá chybějící zboží, nakupuje ho u dodavatelů
> a po naskladnění ho přiřazuje ke správným zákaznickým objednávkám.
> Je nezávislá na platformě: Shoptet je první napojená platforma, další se připojí přes adaptéry.

Interní (technický) název repozitáře: `availability-intelligence-engine`.

> ⚠️ **Stav: vývoj, zatím není v ostrém provozu.** Podrobný a pravdivý přehled toho, co funguje a co chybí,
> je v [STATUS.md](STATUS.md).

---

## Co služba dělá

1. **Zjistí, co chybí.** Z nevyřízených objednávek e-shopu spočítá chybějící kusy. Vlastní sklad se
   rozděluje mezi objednávky postupně (podle priority, pak od nejstarší), takže jeden kus se neslíbí dvakrát.
2. **Hlídá platbu.** Nakupuje a rezervuje vlastní sklad jen pro objednávky, které jsou zaplacené nebo na
   dobírku. Ostatní čekají na zaplacení. Pravidlo si každý e-shop může upravit.
3. **Vybere dodavatele.** Podle mapování produktů a variant, dostupnosti ve feedu, ceny, dodací lhůty a priority.
   Když jeden dodavatel nemá celé množství, rozdělí nákup mezi více dodavatelů.
4. **Sestaví a odešle nákupní objednávky** (automaticky, nebo po ručním schválení). Neobjedná totéž dvakrát
   (idempotence + odečet už objednaného množství).
5. **Sleduje stav u dodavatele** (přijato / odesláno / zrušeno) podle čísla objednávky dodavatele.
6. **Po naskladnění přiřadí zboží** ke konkrétním řádkům zákaznických objednávek.
7. **Zapisuje audit** všech rozhodnutí.

Dále umí: vyhodnocení a řazení dostupnosti produktů, prodejní jednotky (ks / balení / paleta, převody, zálohy
na obaly).

## Architektura

```
Platforma e-shopu (Shoptet, …) ──adaptér──▶ CommercePlatformPort ─┐
Feedy / API dodavatelů         ──adaptér──▶ SupplierCatalogPort  ─┼─▶ jádro (src/core) ─▶ PurchaseOrderPort (PostgreSQL)
                                            SupplierDispatchPort ◀┘                     ─▶ FulfillmentReadinessPort
```

- `src/core/` – obchodní logika bez závislosti na platformě, HTTP nebo databázi.
- `src/platform/shoptet/` – adaptér Shoptetu (zatím jen čtení přes API a normalizace CSV/XML exportu).
- `src/platform/suppliers/` – dodavatelé (obecný API klient, CSV bez API).
- `src/platform/persistence/` – PostgreSQL; každý záznam je oddělen podle e-shopu (`tenant_id`).
- `migrations/` – SQL migrace, spouštět v pořadí `001` → `004`.
- `frontend/` – prezentační web a interaktivní demo s ukázkovými daty (nejde o administraci doplňku).

**Nová platforma** = nový adaptér, který implementuje porty v `src/core/procurement/ports.ts` a převede
objednávky (včetně stavu platby do `PaymentInfo`) na `CustomerOrderLine`. Jádro se nemění.

## Ochrana dat

- Data e-shopů jsou oddělená (`tenant_id` ve všech tabulkách, identifikátory i klíče idempotence).
- Služba neukládá platební údaje (čísla karet, účty), jen stav a způsob platby.
- Přístup do Shoptetu je pouze pro čtení (`ShoptetReadOnlyClient`, jen GET); respektuje limity API (429/503).
- Prezentační web nepoužívá analytiku ani externí fonty a nenastavuje cookies.

## Vývoj

```bash
npm ci
npm run typecheck
npm test
npm run dev        # lokální server prezentačního webu a dema
```

Nasazení prezentačního webu: `npm run deploy` (Cloudflare Workers, konfigurace ve `wrangler.jsonc`).
