import type { PaymentStatusPort } from '../../core/fulfillment/FulfillmentService.js';
import type { InstallResult, PlatformAdapter, PlatformContext, PlatformOrder, PlatformOrderSourcePort } from '../../core/platform/PlatformAdapter.js';
import type { CommercePlatformPort, LoggerPort } from '../../core/procurement/ports.js';
import type { CustomerOrderLine } from '../../core/procurement/types.js';
import { ShoptetAccessTokenProvider, exchangeInstallCode } from './ShoptetAuth.js';
import { ShoptetApiClient, ShoptetApiError } from './ShoptetApiClient.js';
import type { ShoptetConfig } from './ShoptetConfig.js';
import { mapShoptetOrder, mapShoptetPayment, toFulfillmentLines } from './ShoptetMapping.js';
import type { ShoptetOrder } from './ShoptetMapping.js';
import { ORDER_CODE_RE, SHOPTET_WEBHOOK_EVENTS, verifyShoptetWebhook } from './ShoptetWebhooks.js';

/** Hard cap per planning run so one huge shop cannot exhaust the Worker / Shoptet rate limit. */
const MAX_ORDERS_PER_RUN = 500;

/**
 * Shoptet add-on adapter (read-only towards the shop for now).
 *
 * Built from the official documentation WITHOUT a partner account – the parts marked UNVERIFIED must be
 * checked on the partner test e-shop before going live (see PROGRESS_LOG).
 */
export class ShoptetPlatformAdapter implements PlatformAdapter {
    public readonly platform = 'shoptet';
    public readonly supportedModes = ['api'] as const;
    private readonly tokens: ShoptetAccessTokenProvider;

    public constructor(
        private readonly config: ShoptetConfig,
        private readonly logger: LoggerPort,
        private readonly request: typeof fetch = fetch,
        tokens?: ShoptetAccessTokenProvider,
    ) {
        this.tokens = tokens ?? new ShoptetAccessTokenProvider(config, request);
    }

    // ---------- install / uninstall ----------

    public readonly lifecycle = {
        install: (request: Request): Promise<InstallResult> => this.install(request),
        afterInstall: (ctx: PlatformContext) => this.afterInstall(ctx),
    };

    private async install(request: Request): Promise<InstallResult> {
        if (request.method !== 'GET') throw new Error('Shoptet install callback must be GET');
        const ip = request.headers.get('CF-Connecting-IP') ?? '';
        if (this.config.installIpPrefixes.length > 0 && !this.config.installIpPrefixes.some((p) => ip.startsWith(p))) {
            throw new Error('Shoptet install callback from unexpected IP');
        }
        const code = new URL(request.url).searchParams.get('code') ?? '';
        if (!/^[A-Za-z0-9]{16,512}$/.test(code)) throw new Error('Shoptet install callback has invalid code');
        const result = await exchangeInstallCode(this.config, code, this.request);
        return {
            platformShopId: result.eshopId,
            credentials: { oauthAccessToken: result.oauthAccessToken, ...(result.eshopUrl ? { eshopUrl: result.eshopUrl } : {}) },
        };
    }

    /** Background after install: webhook signature key + webhook registration (both are per installation). */
    private async afterInstall(ctx: PlatformContext): Promise<Readonly<Record<string, string>>> {
        const client = await this.client(ctx);
        const keyData = await client.post<{ signatureKey?: string }>('/api/webhooks/renew-signature-key', {});
        if (typeof keyData.signatureKey !== 'string' || keyData.signatureKey.length < 16) throw new Error('Shoptet did not return a webhook signature key');
        try {
            await client.post('/api/webhooks', { data: SHOPTET_WEBHOOK_EVENTS.map((event) => ({ event, url: this.config.webhookUrl })) });
        } catch (error) {
            // 409 = already registered (re-install) – fine. Anything else is a real problem.
            if (!(error instanceof ShoptetApiError && error.status === 409)) throw error;
        }
        this.logger.info('Shoptet webhooks registered', { tenantId: ctx.tenantId, events: SHOPTET_WEBHOOK_EVENTS.length });
        return { webhookSignatureKey: keyData.signatureKey };
    }

    // ---------- webhooks ----------

    public readonly webhooks = {
        verifyAndParse: verifyShoptetWebhook,
    };

    // ---------- reading ----------

    public commerce(ctx: PlatformContext): CommercePlatformPort {
        return { fetchUnfulfilledOrderLines: () => this.fetchUnfulfilledOrderLines(ctx) };
    }

    public payments(ctx: PlatformContext): PaymentStatusPort {
        return {
            getPaymentInfo: async (_tenantId, orderId) => {
                const order = await this.getOrderDetail(ctx, orderId);
                return order ? mapShoptetPayment(order) : undefined;
            },
        };
    }

    public orders(ctx: PlatformContext): PlatformOrderSourcePort {
        return {
            getOrder: async (orderId): Promise<PlatformOrder | undefined> => {
                const order = await this.getOrderDetail(ctx, orderId);
                if (!order) return undefined;
                const mapped = mapShoptetOrder(order);
                this.reportSkipped(ctx, mapped.orderId, mapped.skipped);
                return { orderId: mapped.orderId, cancelled: mapped.cancelled, paymentInfo: mapped.paymentInfo, lines: toFulfillmentLines(mapped) };
            },
        };
    }

    private async fetchUnfulfilledOrderLines(ctx: PlatformContext): Promise<CustomerOrderLine[]> {
        const client = await this.client(ctx);
        const codes: string[] = [];
        for (const statusId of this.config.openStatusIds) {
            const list = await client.getAllPages<{ code?: string }>('/api/orders', 'orders', { statusId: String(statusId) });
            for (const o of list) if (o.code) codes.push(o.code);
        }
        const unique = [...new Set(codes)];
        if (unique.length > MAX_ORDERS_PER_RUN) {
            this.logger.warn('Shoptet: too many open orders, processing the oldest subset', { tenantId: ctx.tenantId, total: unique.length, limit: MAX_ORDERS_PER_RUN });
        }
        const lines: Array<Omit<CustomerOrderLine, 'ownStockQuantity'>> = [];
        for (const code of unique.sort().slice(0, MAX_ORDERS_PER_RUN)) {
            const order = await this.getOrderDetail(ctx, code, client);
            if (!order) continue;
            const mapped = mapShoptetOrder(order);
            if (mapped.cancelled) continue;
            this.reportSkipped(ctx, mapped.orderId, mapped.skipped);
            lines.push(...mapped.lines.map((l) => l.line));
        }
        const stock = await this.ownStock(client, [...new Set(lines.map((l) => l.sku))]);
        return lines.map((l) => ({ ...l, ownStockQuantity: stock.get(l.sku) ?? 0 }));
    }

    /**
     * Own stock per variant code from the default warehouse.
     * UNVERIFIED: whether Shoptet's `amount` already excludes units claimed by open orders (`claim`). We use
     * max(0, amount − claim) = units not promised to anyone, which is the conservative choice (may buy a bit more,
     * never promises the same unit twice). Verify on the partner test e-shop.
     */
    private async ownStock(client: ShoptetApiClient, codes: string[]): Promise<Map<string, number>> {
        const result = new Map<string, number>();
        if (codes.length === 0) return result;
        const stocks = await client.get<{ defaultStockId?: number; stocks?: Array<{ id: number }> }>('/api/stocks');
        const stockId = stocks.defaultStockId || stocks.stocks?.[0]?.id;
        if (!stockId) return result;
        for (let i = 0; i < codes.length; i += 50) {
            const batch = codes.slice(i, i + 50);
            const supplies = await client.getAllPages<{ code?: string; amount?: string | number; claim?: string | number }>(
                `/api/stocks/${encodeURIComponent(String(stockId))}/supplies`, 'supplies', { productCodes: batch.join(',') });
            for (const s of supplies) {
                if (!s.code || !batch.includes(s.code)) continue;
                const free = Math.floor(Number(s.amount ?? 0)) - Math.ceil(Number(s.claim ?? 0));
                result.set(s.code, Number.isFinite(free) ? Math.max(0, free) : 0);
            }
        }
        return result;
    }

    private async getOrderDetail(ctx: PlatformContext, orderId: string, existing?: ShoptetApiClient): Promise<ShoptetOrder | undefined> {
        if (!ORDER_CODE_RE.test(orderId)) throw new Error('Invalid Shoptet order code');
        const client = existing ?? await this.client(ctx);
        try {
            const data = await client.get<{ order?: ShoptetOrder }>(`/api/orders/${encodeURIComponent(orderId)}`);
            return data.order;
        } catch (error) {
            if (error instanceof ShoptetApiError && error.status === 404) return undefined;
            throw error;
        }
    }

    private async client(ctx: PlatformContext): Promise<ShoptetApiClient> {
        const credentials = await ctx.credentials.get(ctx.tenantId);
        const oauth = credentials?.oauthAccessToken;
        if (!oauth) throw new Error('Shoptet installation has no OAuth access token');
        return new ShoptetApiClient(oauth, this.tokens, this.config.apiBaseUrl, this.request);
    }

    private reportSkipped(ctx: PlatformContext, orderId: string, skipped: Array<{ itemId: string; reason: string }>): void {
        if (skipped.length > 0) this.logger.warn('Shoptet order items skipped', { tenantId: ctx.tenantId, orderId, skipped });
    }
}
