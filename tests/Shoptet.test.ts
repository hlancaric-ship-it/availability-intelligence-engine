import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { shoptetSignature, verifyShoptetWebhook } from '../src/platform/shoptet/ShoptetWebhooks.js';
import { mapShoptetOrder, mapShoptetPayment, normaliseTime, toFulfillmentLines } from '../src/platform/shoptet/ShoptetMapping.js';
import { ShoptetAccessTokenProvider, exchangeInstallCode } from '../src/platform/shoptet/ShoptetAuth.js';
import { ShoptetApiClient, retryDelayMs } from '../src/platform/shoptet/ShoptetApiClient.js';
import { shoptetConfigFromEnv } from '../src/platform/shoptet/ShoptetConfig.js';
import type { ShoptetConfig } from '../src/platform/shoptet/ShoptetConfig.js';
import { ShoptetPlatformAdapter } from '../src/platform/shoptet/ShoptetPlatformAdapter.js';
import { createPlatformRegistry } from '../src/platform/platforms.js';
import type { PlatformCredentialsPort } from '../src/core/platform/PlatformAdapter.js';

const quiet = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const config: ShoptetConfig = {
    clientId: 'client-1', clientSecret: 'shoasecret_x',
    oauthTokenUrl: 'https://12345.myshoptet.com/action/ApiOAuthServer/token',
    accessTokenUrl: 'https://12345.myshoptet.com/action/ApiOAuthServer/getAccessToken',
    redirectUri: 'https://l-code-dynamics.com/platforms/shoptet/install',
    webhookUrl: 'https://l-code-dynamics.com/platforms/shoptet/webhook',
    apiBaseUrl: 'https://api.myshoptet.com', openStatusIds: [-1, -2], installIpPrefixes: ['185.184.254.'],
};
const OAUTH = 'o'.repeat(255);
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// Official example from https://developers.shoptet.com/api/documentation/webhooks/
const DOC_BODY = '{"eshopId":315185,"event":"addon:uninstall","eventCreated":"2019-09-23T22:01:36+0200","eventInstance":"315185"}';
const DOC_KEY = '61d1175f54c47dd67df14c17002a17b2';
const DOC_SIGNATURE = 'a0e0a3e7689bd4c80e4d6ffcccb05235b864e1d0';

describe('Shoptet webhooky', () => {
    test('podpis odpovídá oficiálnímu příkladu z dokumentace', async () => {
        expect(await shoptetSignature(DOC_BODY, DOC_KEY)).toBe(DOC_SIGNATURE);
    });

    const resolve = async (id: string) => (id === '315185' || id === '222651' ? { tenantId: `shoptet-${id}`, credentials: { webhookSignatureKey: DOC_KEY } } : undefined);
    const req = (body: string, signature?: string) => new Request('https://x/platforms/shoptet/webhook', {
        method: 'POST', body, headers: { 'Content-Type': 'application/json', ...(signature ? { 'Shoptet-Webhook-Signature': signature } : {}) },
    });

    test('platný podpis → odinstalace', async () => {
        expect(await verifyShoptetWebhook(req(DOC_BODY, DOC_SIGNATURE), resolve)).toEqual([
            expect.objectContaining({ type: 'APP_UNINSTALLED', tenantId: 'shoptet-315185' }),
        ]);
    });
    test('špatný / chybějící podpis, neznámý e-shop, pozměněné tělo → null (nic se neprovede)', async () => {
        expect(await verifyShoptetWebhook(req(DOC_BODY, 'a'.repeat(40)), resolve)).toBeNull();
        expect(await verifyShoptetWebhook(req(DOC_BODY), resolve)).toBeNull();
        expect(await verifyShoptetWebhook(req(DOC_BODY.replace('315185,', '999,'), DOC_SIGNATURE), resolve)).toBeNull();
        expect(await verifyShoptetWebhook(req(DOC_BODY.replace('22:01', '22:02'), DOC_SIGNATURE), resolve)).toBeNull();
        expect(await verifyShoptetWebhook(req('nejson', DOC_SIGNATURE), resolve)).toBeNull();
        expect(await verifyShoptetWebhook(new Request('https://x', { method: 'GET' }), resolve)).toBeNull();
    });
    test('objednávka: událost s orderId a stabilním eventId', async () => {
        const body = '{"eshopId":222651,"event":"order:paid","eventCreated":"2025-02-08T15:13:39+0100","eventInstance":"2025000057"}';
        const [ev] = (await verifyShoptetWebhook(req(body, await shoptetSignature(body, DOC_KEY)), resolve))!;
        expect(ev).toEqual({ eventId: 'shoptet:222651:order:paid:2025-02-08T15:13:39+0100:2025000057', tenantId: 'shoptet-222651', type: 'ORDER_PAID', orderId: '2025000057', occurredAt: '2025-02-08T15:13:39+0100' });
    });
    test('nepodstatná událost se potvrdí, ale nic nespustí', async () => {
        const body = '{"eshopId":222651,"event":"brand:create","eventCreated":"x","eventInstance":"y"}';
        expect(await verifyShoptetWebhook(req(body, await shoptetSignature(body, DOC_KEY)), resolve)).toEqual([]);
    });
    test('příliš velké tělo se odmítne', async () => {
        const body = JSON.stringify({ eshopId: 222651, event: 'order:update', eventCreated: 'x', eventInstance: '1', pad: 'x'.repeat(20_000) });
        expect(await verifyShoptetWebhook(req(body, await shoptetSignature(body, DOC_KEY)), resolve)).toBeNull();
    });
});

describe('Shoptet objednávka → platformně neutrální data', () => {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/shoptet-order-detail.mock.json', import.meta.url), 'utf8')).data.order;

    test('ukázková objednávka z mock serveru Shoptetu', () => {
        const m = mapShoptetOrder(fixture);
        expect(m.orderId).toBe('2017000092');
        expect(m.paymentInfo).toEqual({ paymentStatus: 'PAID', paymentMethod: 'BANK_TRANSFER' });
        expect(m.lines).toEqual([{
            line: { id: '2017000092:342', orderId: '2017000092', productId: '1b02cb8e-d7b5-11e0-9a5c-feab5ed617ed', variantId: '40/ZEL', sku: '40/ZEL', quantity: 1, createdAt: '2018-05-29T07:02:27.000Z', paymentInfo: m.paymentInfo },
            ean: '12345678901234',
        }]);
        expect(toFulfillmentLines(m)[0]).toMatchObject({ customerOrderLineId: '2017000092:342', ean: '12345678901234', orderedQuantity: 1, allocatedQuantity: 0 });
    });
    test('doprava, platba, slevy se ignorují; smazaný produkt a necelé množství se nehádají', () => {
        const m = mapShoptetOrder({
            code: 'X1', items: [
                { itemId: 1, itemType: 'shipping', code: 'PPL', productGuid: 'g', amount: 1 },
                { itemId: 2, itemType: 'billing', amount: 1 },
                { itemId: 3, itemType: 'discount-coupon', amount: 1 },
                { itemId: 4, itemType: 'product', productGuid: null, code: 'A', amount: 1 },
                { itemId: 5, itemType: 'product', productGuid: 'g', code: 'B', amount: '1.500' },
                { itemId: 6, itemType: 'product', productGuid: 'g', code: 'C', amount: '2.000' },
            ],
        });
        expect(m.lines.map((l) => l.line.id)).toEqual(['X1:6']);
        expect(m.lines[0]!.line.quantity).toBe(2);
        expect(m.skipped.map((x) => x.itemId)).toEqual(['4', '5']);
    });
    test('platba: zaplaceno, dobírka, převod, hotově, karta', () => {
        expect(mapShoptetPayment({ paid: true, billingMethod: { id: 1 } })).toEqual({ paymentStatus: 'PAID', paymentMethod: 'COD' });
        expect(mapShoptetPayment({ paid: false, billingMethod: { id: 1 } })).toEqual({ paymentStatus: 'UNPAID', paymentMethod: 'COD' });
        expect(mapShoptetPayment({ paid: false, billingMethod: { id: 2 } })).toEqual({ paymentStatus: 'UNPAID', paymentMethod: 'BANK_TRANSFER' });
        expect(mapShoptetPayment({ paid: false, billingMethod: { id: 3 } }).paymentStatus).toBe('UNPAID');
        expect(mapShoptetPayment({ paid: null, billingMethod: null })).toEqual({ paymentStatus: 'UNPAID', paymentMethod: 'BANK_TRANSFER' });
        expect(mapShoptetPayment({ paid: true, billingMethod: { id: 4 } })).toEqual({ paymentStatus: 'PAID', paymentMethod: 'CARD' });
    });
    test('stornovaná objednávka', () => {
        expect(mapShoptetOrder({ code: 'S', status: { id: -4 }, items: [] }).cancelled).toBe(true);
    });
    test('čas Shoptetu (+0200) → ISO', () => {
        expect(normaliseTime('2018-05-29T09:02:27+0200')).toBe('2018-05-29T07:02:27.000Z');
    });
});

describe('Shoptet OAuth a tokeny', () => {
    test('výměna instalačního kódu – správný požadavek, chyba bez úniku těla', async () => {
        const request = vi.fn().mockResolvedValue(json({ access_token: OAUTH, eshopId: 222651, eshopUrl: 'https://shop.cz/', token_type: 'Bearer' }));
        expect(await exchangeInstallCode(config, 'c'.repeat(40), request as any)).toEqual({ oauthAccessToken: OAUTH, eshopId: '222651', eshopUrl: 'https://shop.cz/' });
        const [url, init] = request.mock.calls[0]!;
        expect(url).toBe(config.oauthTokenUrl);
        expect(JSON.parse(init.body)).toEqual({ client_id: 'client-1', client_secret: 'shoasecret_x', code: 'c'.repeat(40), grant_type: 'authorization_code', redirect_uri: config.redirectUri, scope: 'api' });
        const fail = vi.fn().mockResolvedValue(json({ access_token: 'TAJNE' }, 400));
        await expect(exchangeInstallCode(config, 'c'.repeat(40), fail as any)).rejects.toThrow(/^OAuth code exchange failed: HTTP 400$/);
    });
    test('API token se cachuje, obnoví před vypršením a po invalidaci', async () => {
        let now = 0;
        const request = vi.fn().mockImplementation(async () => json({ access_token: `tok-${request.mock.calls.length}xxxxxxxx`, expires_in: 1800 }));
        const p = new ShoptetAccessTokenProvider(config, request as any, () => now);
        const a = await p.get(OAUTH);
        expect(await p.get(OAUTH)).toBe(a);
        now += 1700_000; // < 2 min before expiry
        expect(await p.get(OAUTH)).not.toBe(a);
        await p.invalidate(OAUTH);
        await p.get(OAUTH);
        expect(request).toHaveBeenCalledTimes(3);
        expect(request.mock.calls[0]![1].headers.Authorization).toBe(`Bearer ${OAUTH}`);
    });
    test('souběžné žádosti o token → jediný požadavek', async () => {
        const request = vi.fn().mockResolvedValue(json({ access_token: 'tok-aaaaaaaaaaaa', expires_in: 1800 }));
        const p = new ShoptetAccessTokenProvider(config, request as any);
        await Promise.all([p.get(OAUTH), p.get(OAUTH), p.get(OAUTH)]);
        expect(request).toHaveBeenCalledTimes(1);
    });
});

describe('Shoptet API klient', () => {
    function tokens() {
        let n = 0;
        return { get: vi.fn(async () => `api-token-${++n}`), invalidate: vi.fn(async () => undefined) } as any;
    }
    test('401 → nový token a jeden opakovaný pokus', async () => {
        const t = tokens();
        const request = vi.fn()
            .mockResolvedValueOnce(json({ errors: [{ errorCode: 'expired-token' }] }, 401))
            .mockResolvedValueOnce(json({ data: { ok: 1 } }));
        expect(await new ShoptetApiClient(OAUTH, t, undefined, request as any).get('/api/eshop')).toEqual({ ok: 1 });
        expect(t.invalidate).toHaveBeenCalledTimes(1);
        expect(request.mock.calls[1]![1].headers['Shoptet-Access-Token']).toBe('api-token-2');
    });
    test('429 / 423 se opakuje podle Retry-After (datum)', async () => {
        const sleep = vi.fn(async () => undefined);
        const request = vi.fn()
            .mockResolvedValueOnce(json({}, 429, { 'Retry-After': new Date(Date.now() + 3000).toUTCString() }))
            .mockResolvedValueOnce(json({}, 423))
            .mockResolvedValueOnce(json({ data: { ok: 1 } }));
        await new ShoptetApiClient(OAUTH, tokens(), undefined, request as any, { sleep }).get('/api/eshop');
        expect(sleep).toHaveBeenCalledTimes(2);
        expect(retryDelayMs('Mon, 01 Jul 2024 12:01:11 GMT', 0, Date.parse('Mon, 01 Jul 2024 12:01:01 GMT'))).toBe(10_000);
    });
    test('chyba neobsahuje token ani tělo; povinné hlavičky', async () => {
        const request = vi.fn().mockResolvedValue(json({ errors: [{ errorCode: 'invalid-token-no-rights', message: 'token afd..123' }] }, 403));
        const err = await new ShoptetApiClient(OAUTH, tokens(), undefined, request as any).get('/api/orders').catch((e) => e);
        expect(err.message).toBe('Shoptet API 403 (invalid-token-no-rights) /api/orders');
        expect(request.mock.calls[0]![1].headers['Content-Type']).toBe('application/vnd.shoptet.v1.0');
    });
    test('požadavky na jeden e-shop jdou po jednom (limit 3 spojení na token)', async () => {
        let active = 0, max = 0;
        const request = vi.fn(async () => { active++; max = Math.max(max, active); await new Promise((r) => setTimeout(r, 2)); active--; return json({ data: {} }); });
        const c = new ShoptetApiClient(OAUTH, tokens(), undefined, request as any);
        await Promise.all([c.get('/api/a'), c.get('/api/b'), c.get('/api/c')]);
        expect(max).toBe(1);
    });
});

describe('Shoptet adaptér', () => {
    const creds = (map: Record<string, string> = { oauthAccessToken: OAUTH }): PlatformCredentialsPort => ({ get: async () => map, put: vi.fn(), delete: vi.fn() });
    const ctx = (c = creds()) => ({ tenantId: 'shoptet-222651', integrationMode: 'api' as const, credentials: c });

    /** Fake network: OAuth server + Shoptet API routes. */
    function fakeShoptet(routes: Record<string, (url: URL, init: RequestInit) => Response>) {
        return vi.fn(async (input: any, init: RequestInit = {}) => {
            const url = new URL(String(input));
            if (url.href === config.accessTokenUrl) return json({ access_token: 'api-tok-xxxxxxxx', expires_in: 1800 });
            if (url.href === config.oauthTokenUrl) return json({ access_token: OAUTH, eshopId: 222651 });
            const key = `${init.method ?? 'GET'} ${url.pathname}`;
            const handler = routes[key];
            if (!handler) return json({ errors: [{ errorCode: 'not-found' }] }, 404);
            return handler(url, init);
        });
    }

    test('instalace: jen z IP Shoptetu, platný kód, vrací e-shop a token', async () => {
        const a = new ShoptetPlatformAdapter(config, quiet, fakeShoptet({}) as any);
        const ok = new Request(`${config.redirectUri}?code=${'a'.repeat(64)}`, { headers: { 'CF-Connecting-IP': '185.184.254.10' } });
        expect(await a.lifecycle.install(ok)).toEqual({ platformShopId: '222651', credentials: { oauthAccessToken: OAUTH } });
        await expect(a.lifecycle.install(new Request(`${config.redirectUri}?code=${'a'.repeat(64)}`, { headers: { 'CF-Connecting-IP': '1.2.3.4' } }))).rejects.toThrow(/IP/);
        await expect(a.lifecycle.install(new Request(`${config.redirectUri}?code=<script>`, { headers: { 'CF-Connecting-IP': '185.184.254.10' } }))).rejects.toThrow(/code/);
    });
    test('po instalaci: klíč pro podpis webhooků + registrace webhooků (opakovaná instalace = 409 nevadí)', async () => {
        const registered: unknown[] = [];
        const request = fakeShoptet({
            'POST /api/webhooks/renew-signature-key': () => json({ data: { signatureKey: 'k'.repeat(32) } }),
            'POST /api/webhooks': (_u, init) => { registered.push(JSON.parse(String(init.body))); return json({ errors: [{ errorCode: 'conflict' }] }, 409); },
        });
        const extra = await new ShoptetPlatformAdapter(config, quiet, request as any).lifecycle.afterInstall(ctx());
        expect(extra).toEqual({ webhookSignatureKey: 'k'.repeat(32) });
        expect((registered[0] as any).data.map((d: any) => d.event)).toEqual(['order:create', 'order:update', 'order:paid', 'order:cancel', 'order:delete']);
        expect((registered[0] as any).data.every((d: any) => d.url === config.webhookUrl)).toBe(true);
    });
    test('nevyřízené objednávky → řádky s vlastním skladem (volné = amount − claim)', async () => {
        const fixture = JSON.parse(readFileSync(new URL('./fixtures/shoptet-order-detail.mock.json', import.meta.url), 'utf8'));
        const request = fakeShoptet({
            'GET /api/orders': (u) => json({ data: { orders: u.searchParams.get('statusId') === '-1' ? [{ code: '2017000092' }] : [], paginator: { pageCount: 1 } } }),
            'GET /api/orders/2017000092': () => json(fixture),
            'GET /api/stocks': () => json({ data: { stocks: [{ id: 1 }], defaultStockId: 1 } }),
            'GET /api/stocks/1/supplies': () => json({ data: { supplies: [{ code: '40/ZEL', amount: '7', claim: '2' }], paginator: { pageCount: 1 } } }),
        });
        const lines = await new ShoptetPlatformAdapter(config, quiet, request as any).commerce(ctx()).fetchUnfulfilledOrderLines();
        expect(lines).toEqual([expect.objectContaining({ id: '2017000092:342', sku: '40/ZEL', quantity: 1, ownStockQuantity: 5 })]);
    });
    test('platba pro zámek expedice a objednávka pro sklad', async () => {
        const fixture = JSON.parse(readFileSync(new URL('./fixtures/shoptet-order-detail.mock.json', import.meta.url), 'utf8'));
        const request = fakeShoptet({ 'GET /api/orders/2017000092': () => json(fixture) });
        const a = new ShoptetPlatformAdapter(config, quiet, request as any);
        expect(await a.payments(ctx()).getPaymentInfo('shoptet-222651', '2017000092')).toEqual({ paymentStatus: 'PAID', paymentMethod: 'BANK_TRANSFER' });
        expect(await a.payments(ctx()).getPaymentInfo('shoptet-222651', 'NEEXISTUJE')).toBeUndefined();
        const order = await a.orders(ctx()).getOrder('2017000092');
        expect(order).toMatchObject({ orderId: '2017000092', cancelled: false, lines: [expect.objectContaining({ ean: '12345678901234' })] });
        for (const bad of ['../../admin', 'a/b', '..', '1.2', '']) await expect(a.orders(ctx()).getOrder(bad)).rejects.toThrow(/Invalid/);
        expect(request.mock.calls.every(([u]: any[]) => !String(u).includes('admin'))).toBe(true);
    });
    test('bez OAuth tokenu nic nevolá', async () => {
        const request = vi.fn();
        await expect(new ShoptetPlatformAdapter(config, quiet, request as any).commerce(ctx(creds({}))).fetchUnfulfilledOrderLines()).rejects.toThrow(/OAuth/);
        expect(request).not.toHaveBeenCalled();
    });
});

describe('Konfigurace a registrace', () => {
    const env = {
        SHOPTET_CLIENT_ID: 'id', SHOPTET_OAUTH_TOKEN_URL: config.oauthTokenUrl, SHOPTET_ACCESS_TOKEN_URL: config.accessTokenUrl,
        SHOPTET_REDIRECT_URI: config.redirectUri, SHOPTET_WEBHOOK_URL: config.webhookUrl,
    };
    test('neúplná konfigurace → Shoptet se nezaregistruje (nic neběží napůl)', () => {
        expect(shoptetConfigFromEnv({})).toBeUndefined();
        expect(createPlatformRegistry({}).list()).toEqual([]);
        expect(createPlatformRegistry({ ...env, SHOPTET_CLIENT_ID: '' }).list()).toEqual([]);
    });
    test('úplná konfigurace → registrace; http se odmítne; výchozí stavy -1,-2', () => {
        expect(createPlatformRegistry(env).list()).toEqual(['shoptet']);
        expect(shoptetConfigFromEnv(env)!.openStatusIds).toEqual([-1, -2]);
        expect(() => shoptetConfigFromEnv({ ...env, SHOPTET_WEBHOOK_URL: 'http://x' })).toThrow(/https/);
    });
});
