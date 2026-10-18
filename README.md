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
7. **Hlídá sklad a expedici.** Objednávku pustí k balení, jen když je kompletní a zaplacená (bezpečnostní zámek;
   částečnou expedici lze povolit). Skladník balí skenerem (EAN/SKU) – systém odmítne špatný produkt i kus navíc.
   Platbu ověří u platformy znovu před balením i před odesláním. Příjem zboží také skenerem.
8. **Hromadné akce:** schválení vybraných nákupů, odeslání vybraných objednávek (každá zvlášť, chyba jedné nezastaví ostatní).
9. **Zapisuje audit** všech rozhodnutí.

Dále umí: vyhodnocení a řazení dostupnosti produktů, prodejní jednotky (ks / balení / paleta, převody, zálohy
na obaly).

## Architektura

```
Platforma e-shopu (Shoptet, …) ──adaptér──▶ CommercePlatformPort ─┐
Feedy / API dodavatelů         ──adaptér──▶ SupplierCatalogPort  ─┼─▶ jádro (src/core) ─▶ PurchaseOrderPort (PostgreSQL)
                                            SupplierDispatchPort ◀┘                     ─▶ FulfillmentReadinessPort
```

- `src/core/fulfillment/` – sklad a expedice (zámek, skenování, příjem, odeslání).
- `src/core/` – obchodní logika bez závislosti na platformě, HTTP nebo databázi.
- `src/platform/shoptet/` – adaptér Shoptetu (zatím jen čtení přes API a normalizace CSV/XML exportu).
- `src/platform/suppliers/` – dodavatelé (obecný API klient, CSV bez API).
- `src/platform/persistence/` – PostgreSQL; každý záznam je oddělen podle e-shopu (`tenant_id`).
- `migrations/` – SQL migrace, spouštět v pořadí `001` → `007`.
- `frontend/` – prezentační web a interaktivní demo s ukázkovými daty (nejde o administraci doplňku).

- `src/core/platform/` – **obecné rozhraní platformy** (`PlatformAdapter`, `PlatformRegistry`).
- `src/platform/http/AdminApi.ts` – HTTP API administrace (`/api/v1/...`).
- `src/platform/cloudflare/backend.ts` – složení služby pro Cloudflare Workers (API, instalace, webhooky, cron).

### Napojení libovolné platformy (Shoptet, WooCommerce, Upgates, Shopify, …)

Celá služba mluví s e-shopem **jen** přes `PlatformAdapter`. Nová platforma znamená:

1. Napsat adaptér (`src/platform/<platforma>/`), který implementuje:
   - `commerce(ctx)` – nevyřízené objednávky → `CustomerOrderLine` (včetně `PaymentInfo`),
   - `payments(ctx)` – čerstvý stav platby (ověřuje se před nákupem, balením i odesláním),
   - volitelně `outbound(ctx)` – zápis stavů objednávek a skladu zpět,
   - volitelně `webhooks.verifyAndParse` – ověření podpisu a převod na `PlatformEvent`,
   - volitelně `lifecycle.install` – instalační callback (např. OAuth kód → token).
2. Zaregistrovat ho v `src/platform/platforms.ts`: `platforms.register(new MojePlatformaAdapter(...))`.

Zbytek je společný: instalace `/platforms/<platforma>/install`, webhooky `/platforms/<platforma>/webhook`,
šifrované uložení tokenů, smazání všech dat po odinstalaci, plánovač, API administrace. Jádro se nemění.
Dokud adaptér chybí, platí bezpečné výchozí chování: neznámý stav platby ⇒ objednávka zůstane zamčená.

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

## Nasazení (Cloudflare Workers + PostgreSQL přes Hyperdrive)

Jeden Worker obsluhuje web, demo, API administrace (`/api/v1`), instalace a webhooky platforem
(`/platforms/...`) a plánovač (Cron Triggers).

```bash
# 1) PostgreSQL (např. Neon / Supabase) – spustit migrace v pořadí 001 → 007
psql "$DATABASE_URL" -f migrations/001_procurement_core.sql   # … až 006

# 2) Hyperdrive – vrácené id vložit do wrangler.jsonc (hyperdrive[0].id)
npx wrangler hyperdrive create chytry-nakupci-db --connection-string="$DATABASE_URL"

# 3) Tajné klíče (nikdy do repozitáře)
openssl rand -base64 32 | npx wrangler secret put CREDENTIALS_ENCRYPTION_KEY
openssl rand -base64 48 | npx wrangler secret put ADMIN_API_TOKEN     # prozatímní přihlášení do API
npx wrangler secret put ADMIN_TENANT_ID                                # e-shop, ke kterému token patří

# 4) Nasazení (spustí typecheck a testy)
npm run deploy
```

### Zapnutí Shoptetu (po získání partnerského účtu)

1. V partnerské administraci (Propojení → API partner → Přístup k API) opsat Client ID, URL OAuth serveru (`…/token`)
   a URL pro API token (`…/getAccessToken`) do `vars` ve `wrangler.jsonc`.
2. `npx wrangler secret put SHOPTET_CLIENT_SECRET`
3. V nastavení doplňku: URL pro OAuth kód = `https://l-code-dynamics.com/platforms/shoptet/install`,
   systémové webhooky `addon:uninstall`, `addon:terminate` → `https://l-code-dynamics.com/platforms/shoptet/webhook`.
4. `npm run deploy` a v záložce Uživatelé spustit testovací instalaci.

Přihlášení do API je zatím **prozatímní** (`Authorization: Bearer <ADMIN_API_TOKEN>` → jeden e-shop).
Změny vyžadují hlavičku `Idempotency-Key` (opakovaný požadavek se neprovede dvakrát).
