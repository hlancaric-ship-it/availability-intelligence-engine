# Availability Intelligence Engine (AIE) 2.0
> **Chytrý nákupní a kompletační asistent pro e-shopy**

AIE je automatický systém, který za e-shopaře hlídá sklad, sám nakupuje chybějící zboží u dodavatelů a dohlíží na to, aby skladníci zabalili balíky bez chyb a včas.

---

## 🛒 Co AIE přináší e-shopu (přehled pro e-shopaře)

### 1. Už žádné ruční počítání, co chybí a kde to objednat
* **Jak to fungovalo starém v systému (Brani)**: Když zákazník objednal 6 kusů a vy jste měli na skladě jen 4, museli jste ručně zjišťovat, u kterého dodavatele zbytek dokoupit.
* **Jak to dělá AIE**: Systém okamžitě sám zjistí, že chybí 2 kusy. Podívá se na nabídky vašich dodavatelů a **sám nákup rozloží** — např. 4 kusy vezme od hlavního dodavatele a 2 kusy automaticky přiobjedná od záložního partnera. Zákazník tak dostane celou objednávku v jednom balíku bez zdržení.

### 2. Balení balíků bez chyb a špatně poslaného zboží
* **Poctivé pořadí (Fronta)**: Doručené zboží se automaticky přiřadí nejstarším čekajícím zákazníkům. Nikdo nepředbíhá.
* **Pípání skenerem na skladě**: Skladník při příjmu i zabalení pípne čárový kód (EAN/SKU). Pokud pípne špatný produkt nebo jinou barvu/velikost, systém ho ihned zvukově varuje.
* **Bezpečnostní zámek balení**: Tiskový štítek a možnost expedovat se zpřístupní **AŽ ve chvíli**, kdy je zboží pro zákazníka 100% naskladněno a připraveno k zabalení. Skladník nemůže poslat neúplný balík.

### 3. Přehledný příběh u každé objednávky (Víte přesně, co se děje)
* U každé objednávky vidíte jasnou časovou osu: **Co zákazník objednal $\rightarrow$ Co máme na skladě $\rightarrow$ Co se objednalo u dodavatele $\rightarrow$ Kdy to dorazí**.
* **Žádné spammování dodavatelů**: Systém si pamatuje, co už objednal. Zboží od dodavatele neobjednává dvakrát ani neposílá duplicitní e-maily.

### 4. Funguje plně automaticky bez složitého nastavování
* E-shopař nemusí nic ručně nahrávat ani stahovat.
* Systém si sám stahuje nové objednávky z e-shopu, rozešle nákupní podklady dodavatelům a po naskladnění sám změní stavy v e-shopu a připraví štítky k tisku.

### 5. Hromadné akce na jedno kliknutí
* **Jedním klikem**: Vytisknete všechny štítky pro dnešní expedici, schválíte všechny nákupy u dodavatelů nebo označíte 50 balíků za odeslané.

---

## 📋 Přehledné sekce pro denní práci v e-shopu

1. **PŘEHLED**: Vaše denní operační centrum. Vidíte 3 sloupce: *Co čeká na nákup*, *Co vyžaduje pozornost* a *Co můžete ihned zabalit*.
2. **OBJEDNÁVKY**: Seznam všech zákazníků, stav naskladnění jejich zboží a tlačítka pro tisk štítku a expedici.
3. **DOSTUPNOST**: Přehled produktů, kde chybí kusy, a automaty navržená řešení.
4. **NÁKUP**: Seznam nákupních objednávek připravených k odeslání dodavatelům.
5. **PŘÍJEM ZBOŽÍ**: Místo, kde skladník pípne přicházející balíky a systém je sám přiřadí zákazníkům.
6. **DODAVATELÉ**: Nastavení vašich velkoobchodních partnerů, jejich dodacích lhůt a priorit.
7. **PRODUKTY & MAPOVÁNÍ**: Propojení vašich produktů s kódy dodavatelů.

---

## ⚡ Ověření funkčnosti

```bash
npm run typecheck
npm test
```

## Co je nutné před produkcí

Tento repozitář neobsahuje běžící službu ani přihlašovací údaje. `ShoptetReadOnlyClient` používá pouze read token a GET; před nasazením je nutné dodat tenant secrets a mapování reálných Shoptet payloadů. Je také nutné připojit PostgreSQL transakční adapter, spustit migraci, nakonfigurovat dodavatelské feedy/odesílání PO, worker pro scheduled no-API import, interní endpoint dashboardu, observabilitu a provozní alerty.
