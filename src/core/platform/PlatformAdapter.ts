/**
 * Contract every commerce platform (Shoptet, WooCommerce, Upgates, Shopify, …) implements.
 * The core, admin API, scheduler and webhooks talk ONLY to this interface – adding a platform =
 * one new adapter + `registry.register(adapter)`; nothing else changes.
 */
import type { PaymentStatusPort } from '../fulfillment/FulfillmentService.js';
import type { CommercePlatformPort } from '../procurement/ports.js';
import type { StoreStockAdjustmentPayload } from '../procurement/types.js';

export type IntegrationMode = 'api' | 'import';

/** Per-tenant secrets (OAuth tokens, API keys, webhook secrets). Implementations MUST encrypt at rest. */
export interface PlatformCredentialsPort {
    get(tenantId: string): Promise<Readonly<Record<string, string>> | undefined>;
    put(tenantId: string, credentials: Readonly<Record<string, string>>): Promise<void>;
    delete(tenantId: string): Promise<void>;
}

export interface PlatformContext {
    tenantId: string;
    integrationMode: IntegrationMode;
    credentials: PlatformCredentialsPort;
}

/** Platform-neutral order status written back to the shop. Adapters map it to their own status IDs. */
export type OutboundOrderStatus = 'WAITING_FOR_STOCK' | 'READY_TO_PACK' | 'PACKED' | 'SHIPPED' | 'CANCELLED';

export interface PlatformOutboundPort {
    updateOrderStatus(orderId: string, status: OutboundOrderStatus, tracking?: { carrier?: string; trackingNumber?: string }): Promise<void>;
    adjustStock(payload: StoreStockAdjustmentPayload): Promise<void>;
}

/** Normalised platform event (from a webhook or a polling diff). */
export interface PlatformEvent {
    /** Unique per platform event – used as idempotency key. */
    eventId: string;
    tenantId: string;
    type: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'ORDER_PAID' | 'ORDER_CANCELLED' | 'APP_UNINSTALLED';
    orderId?: string;
    occurredAt: string;
}

export interface PlatformWebhookPort {
    /**
     * Verifies authenticity (signature / shared secret) and parses the request.
     * MUST return null for anything unverifiable – the caller answers 401 and does nothing.
     * `resolveTenant` maps the platform's shop identifier to our tenantId (never trust a tenantId from the payload).
     */
    verifyAndParse(request: Request, resolveTenant: (platformShopId: string) => Promise<{ tenantId: string; credentials: Readonly<Record<string, string>> } | undefined>): Promise<PlatformEvent[] | null>;
}

export interface InstallResult {
    /** Stable shop identifier on the platform (e.g. Shoptet eshopId). */
    platformShopId: string;
    credentials: Record<string, string>;
}

export interface PlatformLifecyclePort {
    /** Handles the platform's install callback (OAuth code exchange …). */
    install(request: Request): Promise<InstallResult>;
}

export interface PlatformAdapter {
    /** Adapter key stored in `tenants.platform`, e.g. 'shoptet'. */
    readonly platform: string;
    readonly supportedModes: readonly IntegrationMode[];
    commerce(ctx: PlatformContext): CommercePlatformPort;
    payments(ctx: PlatformContext): PaymentStatusPort;
    /** Optional: write-back (order status, stock). Absent = read-only integration. */
    outbound?(ctx: PlatformContext): PlatformOutboundPort;
    webhooks?: PlatformWebhookPort;
    lifecycle?: PlatformLifecyclePort;
}

export class PlatformRegistry {
    private readonly adapters = new Map<string, PlatformAdapter>();

    public register(adapter: PlatformAdapter): this {
        if (!/^[a-z0-9-]{2,32}$/.test(adapter.platform)) throw new Error(`Invalid platform key "${adapter.platform}"`);
        if (this.adapters.has(adapter.platform)) throw new Error(`Platform "${adapter.platform}" is already registered`);
        this.adapters.set(adapter.platform, adapter);
        return this;
    }

    public get(platform: string): PlatformAdapter | undefined {
        return this.adapters.get(platform);
    }

    public list(): string[] {
        return [...this.adapters.keys()];
    }
}

/** Looks up a tenant's platform + mode (implemented by the tenants table, migration 006). */
export interface TenantLookupPort {
    getTenant(tenantId: string): Promise<{ tenantId: string; platform: string; integrationMode: IntegrationMode; enabled: boolean } | undefined>;
}

/**
 * Single PaymentStatusPort for the whole service that routes each call to the tenant's platform adapter.
 * Fail-safe: unknown tenant / disabled tenant / missing adapter ⇒ undefined ⇒ payment gate keeps the order locked.
 */
export class PlatformRoutedPaymentStatus implements PaymentStatusPort {
    public constructor(private readonly registry: PlatformRegistry, private readonly tenants: TenantLookupPort, private readonly credentials: PlatformCredentialsPort) {}

    public async getPaymentInfo(tenantId: string, orderId: string) {
        const tenant = await this.tenants.getTenant(tenantId);
        if (!tenant?.enabled) return undefined;
        const adapter = this.registry.get(tenant.platform);
        if (!adapter) return undefined;
        return adapter.payments({ tenantId, integrationMode: tenant.integrationMode, credentials: this.credentials }).getPaymentInfo(tenantId, orderId);
    }
}
