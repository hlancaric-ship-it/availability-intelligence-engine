import type { PlatformEvent } from '../../core/platform/PlatformAdapter.js';

const MAX_BODY_BYTES = 16 * 1024;
/** Shoptet order codes: usually digits, may contain letters and dashes (docs). No dots/slashes. */
export const ORDER_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const EVENT_MAP: Record<string, PlatformEvent['type']> = {
    'order:create': 'ORDER_CREATED',
    'order:update': 'ORDER_UPDATED',
    'order:paid': 'ORDER_PAID',
    'order:cancel': 'ORDER_CANCELLED',
    'order:delete': 'ORDER_CANCELLED',
    'addon:uninstall': 'APP_UNINSTALLED',
    'addon:terminate': 'APP_UNINSTALLED',
};

/** Webhooks we register at install time. addon:* system webhooks are set in the partner administration instead. */
export const SHOPTET_WEBHOOK_EVENTS = ['order:create', 'order:update', 'order:paid', 'order:cancel', 'order:delete'] as const;

/** hash_hmac('sha1', rawBody, signatureKey) in lowercase hex – Shoptet's documented scheme. */
export async function shoptetSignature(rawBody: string, signatureKey: string): Promise<string> {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signatureKey), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
    return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export interface ShoptetWebhookBody { eshopId: number | string; event: string; eventCreated: string; eventInstance: string }

/**
 * Verifies and normalises one Shoptet webhook.
 * Returns null when anything is unverifiable (unknown shop, missing key, bad signature, malformed body) → caller answers 401.
 * Returns [] for verified but irrelevant events (acknowledged, nothing to do).
 */
export async function verifyShoptetWebhook(
    request: Request,
    resolveTenant: (eshopId: string) => Promise<{ tenantId: string; credentials: Readonly<Record<string, string>> } | undefined>,
): Promise<PlatformEvent[] | null> {
    if (request.method !== 'POST') return null;
    const declared = Number(request.headers.get('Content-Length') ?? '0');
    if (declared > MAX_BODY_BYTES) return null;
    const raw = await request.text(); // signature is computed over the RAW body – never re-serialise
    if (raw.length === 0 || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;

    let body: ShoptetWebhookBody;
    try { body = JSON.parse(raw) as ShoptetWebhookBody; } catch { return null; }
    const eshopId = String(body?.eshopId ?? '');
    if (!/^\d{1,12}$/.test(eshopId) || typeof body.event !== 'string' || typeof body.eventCreated !== 'string') return null;

    const tenant = await resolveTenant(eshopId);
    const key = tenant?.credentials.webhookSignatureKey;
    const signature = (request.headers.get('Shoptet-Webhook-Signature') ?? '').trim().toLowerCase();
    if (!tenant || !key || !signature) return null;
    if (!constantTimeEqual(await shoptetSignature(raw, key), signature)) return null;

    const type = EVENT_MAP[body.event];
    if (!type) return [];
    const instance = String(body.eventInstance ?? '');
    if (type !== 'APP_UNINSTALLED' && !ORDER_CODE_RE.test(instance)) return null;

    return [{
        // Stable across Shoptet retries of the same notification → idempotency key.
        eventId: `shoptet:${eshopId}:${body.event}:${body.eventCreated}:${instance}`.slice(0, 200),
        tenantId: tenant.tenantId,
        type,
        ...(type !== 'APP_UNINSTALLED' ? { orderId: instance } : {}),
        occurredAt: body.eventCreated,
    }];
}
