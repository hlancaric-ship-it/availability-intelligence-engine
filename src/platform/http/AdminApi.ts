import type { DashboardReaderPort } from '../operations/DashboardEndpoint.js';
import type { FulfillmentRepositoryPort, FulfillmentService } from '../../core/fulfillment/FulfillmentService.js';
import { ConcurrentModificationError } from '../../core/fulfillment/FulfillmentService.js';
import { FulfillmentLockedError } from '../../core/fulfillment/FulfillmentEngine.js';
import type { ProcurementWorkflow } from '../../core/procurement/Workflow.js';
import type { LoggerPort } from '../../core/procurement/ports.js';

export interface AuditEntry { id: string; type: string; entityId: string; payload: unknown; occurredAt: string }
export interface AuditReaderPort { listAudit(tenantId: string, limit: number): Promise<AuditEntry[]> }

export interface AdminApiDeps {
    /**
     * REQUIRED. Resolves the tenant from an authenticated credential; null = 401.
     * The tenant is never taken from the URL, query, body or custom headers (IDOR protection).
     */
    authenticate: (request: Request) => Promise<string | null>;
    dashboard: DashboardReaderPort;
    audit: AuditReaderPort;
    fulfillment: FulfillmentService;
    fulfillmentRepository: FulfillmentRepositoryPort;
    workflow: ProcurementWorkflow;
    logger: LoggerPort;
}

/** Client-facing error: message is safe to show; anything else becomes a generic 500. */
export class ApiError extends Error {
    public constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export const API_PREFIX = '/api/v1';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_BULK = 500;
const ID_RE = /^[\w.:-]{1,128}$/;
const IDEMPOTENCY_RE = /^[\w.:-]{8,128}$/;

type Handler = (ctx: { tenantId: string; params: string[]; request: Request; url: URL }) => Promise<unknown>;
interface Route { method: string; pattern: RegExp; handler: Handler }

/**
 * Admin HTTP API (TODO krok 2). Uniform JSON responses:
 *   success → 200 { data }, error → 4xx/5xx { error: { code, message } }.
 * Mutations require header `Idempotency-Key` (8–128 chars), passed to the workflow as eventId,
 * so a retried request (network glitch, double click) never repeats the action.
 */
export class AdminApi {
    private readonly routes: Route[];

    public constructor(private readonly deps: AdminApiDeps) {
        if (typeof deps.authenticate !== 'function') throw new Error('AdminApi requires an authenticate function (fail-closed)');
        const id = '([\\w.:-]{1,128})';
        const r = (method: string, path: string, handler: Handler): Route => ({ method, pattern: new RegExp(`^${API_PREFIX}${path}$`), handler });
        this.routes = [
            r('GET', '/dashboard', ({ tenantId }) => deps.dashboard.getDashboardData(tenantId)),
            r('GET', '/audit', ({ tenantId, url }) => deps.audit.listAudit(tenantId, intParam(url, 'limit', 100, 1, 500))),

            // Warehouse / fulfillment
            r('GET', '/fulfillment/ready-to-pack', ({ tenantId, url }) => deps.fulfillment.listReadyToPack(tenantId, intParam(url, 'limit', 100, 1, 500))),
            r('GET', `/fulfillment/orders/${id}`, async ({ tenantId, params }) => {
                const order = await deps.fulfillmentRepository.get(tenantId, params[0]!);
                if (!order) throw new ApiError(404, 'NOT_FOUND', 'Objednávka nenalezena');
                return order;
            }),
            r('POST', `/fulfillment/orders/${id}/scan`, async ({ tenantId, params, request }) => {
                const body = await readJson(request);
                return deps.fulfillment.scanForPacking(tenantId, params[0]!, str(body, 'code', 64));
            }),
            r('POST', `/fulfillment/orders/${id}/reset-packing`, ({ tenantId, params }) => deps.fulfillment.resetPacking(tenantId, params[0]!)),
            r('POST', `/fulfillment/orders/${id}/ship`, async ({ tenantId, params, request }) => {
                const body = await readJson(request);
                return deps.fulfillment.ship(tenantId, params[0]!, tracking(body));
            }),
            r('POST', '/fulfillment/ship-many', async ({ tenantId, request }) => {
                const body = await readJson(request);
                const orderIds = idList(body, 'orderIds');
                const raw = body.tracking ?? {};
                if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new ApiError(400, 'VALIDATION', 'tracking musí být objekt');
                const trackingByOrder: Record<string, { trackingNumber?: string; carrier?: string }> = {};
                for (const [orderId, t] of Object.entries(raw as Record<string, unknown>)) {
                    if (!ID_RE.test(orderId)) throw new ApiError(400, 'VALIDATION', 'Neplatné ID objednávky v tracking');
                    trackingByOrder[orderId] = tracking((t ?? {}) as Record<string, unknown>);
                }
                return deps.fulfillment.shipMany(tenantId, orderIds, trackingByOrder);
            }),

            // Procurement
            r('POST', '/purchase-orders/approve', async ({ tenantId, request }) => {
                const body = await readJson(request);
                return deps.workflow.approvePurchaseOrders(tenantId, idempotencyKey(request), idList(body, 'purchaseOrderIds'));
            }),
            r('POST', `/purchase-orders/${id}/cancel`, async ({ tenantId, params, request }) => {
                await deps.workflow.cancelPurchaseOrder(tenantId, idempotencyKey(request), params[0]!);
                return { ok: true };
            }),
            r('PATCH', `/purchase-orders/${id}/supplier`, async ({ tenantId, params, request }) => {
                const body = await readJson(request);
                const supplierId = str(body, 'supplierId', 128);
                if (!ID_RE.test(supplierId)) throw new ApiError(400, 'VALIDATION', 'Neplatné supplierId');
                await deps.workflow.overridePurchaseOrderSupplier(tenantId, idempotencyKey(request), params[0]!, supplierId);
                return { ok: true };
            }),
            r('PATCH', `/purchase-order-lines/${id}`, async ({ tenantId, params, request }) => {
                const body = await readJson(request);
                const quantity = body.quantity;
                if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) {
                    throw new ApiError(400, 'VALIDATION', 'quantity musí být kladné celé číslo');
                }
                await deps.workflow.updatePurchaseOrderLineQuantity(tenantId, idempotencyKey(request), params[0]!, quantity);
                return { ok: true };
            }),
        ];
    }

    /** Returns undefined when the path is outside API_PREFIX (caller serves static assets). */
    public async handle(request: Request): Promise<Response | undefined> {
        const url = new URL(request.url);
        if (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) return undefined;

        let tenantId: string | null = null;
        try { tenantId = await this.deps.authenticate(request); } catch { tenantId = null; }
        if (!tenantId) return errorResponse(401, 'UNAUTHORIZED', 'Nepřihlášeno');

        const candidates = this.routes.filter((rt) => rt.pattern.test(url.pathname));
        if (candidates.length === 0) return errorResponse(404, 'NOT_FOUND', 'Neznámý endpoint');
        const route = candidates.find((rt) => rt.method === request.method);
        if (!route) return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Metoda není povolena', { Allow: candidates.map((c) => c.method).join(', ') });

        try {
            const params = (route.pattern.exec(url.pathname) ?? []).slice(1).map((p) => decodeURIComponent(p));
            const data = await route.handler({ tenantId, params, request, url });
            return json(200, { data });
        } catch (error) {
            return this.toErrorResponse(error, tenantId, route.method, url.pathname);
        }
    }

    private toErrorResponse(error: unknown, tenantId: string, method: string, path: string): Response {
        if (error instanceof ApiError) return errorResponse(error.status, error.code, error.message);
        if (error instanceof ConcurrentModificationError) return errorResponse(409, 'CONFLICT', 'Objednávku mezitím změnil někdo jiný, načtěte ji znovu');
        if (error instanceof FulfillmentLockedError) return errorResponse(409, 'LOCKED', error.message);
        // Domain validation errors from the core are deliberately not exposed verbatim (may contain internals).
        this.deps.logger.error('Admin API failure', { tenantId, method, path, error: error instanceof Error ? error.message : 'Unknown error' });
        return errorResponse(500, 'INTERNAL', 'Interní chyba serveru');
    }
}

// ---------- helpers ----------

const BASE_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extra } });
}

function errorResponse(status: number, code: string, message: string, extra: Record<string, string> = {}): Response {
    return json(status, { error: { code, message } }, extra);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
    const type = request.headers.get('Content-Type') ?? '';
    if (!/^application\/json\b/i.test(type)) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Očekáván Content-Type: application/json');
    const declared = Number(request.headers.get('Content-Length') ?? '0');
    if (declared > MAX_BODY_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Požadavek je příliš velký');
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Požadavek je příliš velký');
    let parsed: unknown;
    try { parsed = text === '' ? {} : JSON.parse(text); } catch { throw new ApiError(400, 'INVALID_JSON', 'Neplatný JSON'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ApiError(400, 'INVALID_JSON', 'Tělo musí být JSON objekt');
    return parsed as Record<string, unknown>;
}

function str(body: Record<string, unknown>, key: string, max: number): string {
    const v = body[key];
    if (typeof v !== 'string' || v.trim() === '' || v.length > max) throw new ApiError(400, 'VALIDATION', `${key} je povinný text (max ${max} znaků)`);
    return v.trim();
}

function optStr(body: Record<string, unknown>, key: string, max: number): string | undefined {
    const v = body[key];
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v !== 'string' || v.length > max) throw new ApiError(400, 'VALIDATION', `${key} musí být text (max ${max} znaků)`);
    return v.trim();
}

function tracking(body: Record<string, unknown>): { trackingNumber?: string; carrier?: string } {
    const trackingNumber = optStr(body, 'trackingNumber', 64);
    const carrier = optStr(body, 'carrier', 64);
    return { ...(trackingNumber ? { trackingNumber } : {}), ...(carrier ? { carrier } : {}) };
}

function idList(body: Record<string, unknown>, key: string): string[] {
    const v = body[key];
    if (!Array.isArray(v) || v.length === 0 || v.length > MAX_BULK) throw new ApiError(400, 'VALIDATION', `${key} musí být neprázdné pole (max ${MAX_BULK})`);
    if (!v.every((x) => typeof x === 'string' && ID_RE.test(x))) throw new ApiError(400, 'VALIDATION', `${key} obsahuje neplatné ID`);
    return v as string[];
}

function idempotencyKey(request: Request): string {
    const key = request.headers.get('Idempotency-Key');
    if (!key || !IDEMPOTENCY_RE.test(key)) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Chybí nebo je neplatná hlavička Idempotency-Key');
    return `api:${key}`;
}

function intParam(url: URL, key: string, def: number, min: number, max: number): number {
    const raw = url.searchParams.get(key);
    if (raw === null) return def;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(400, 'VALIDATION', `${key} musí být celé číslo ${min}–${max}`);
    return n;
}

/**
 * PROZATÍMNÍ přihlášení do doby, než bude hotové S1 (krok 3 – přihlášení přes Shoptet OAuth):
 * jeden tajný token (Bearer) → jeden e-shop. Porovnání v konstantním čase přes SHA-256.
 */
export function bearerTokenAuthenticator(expectedToken: string | undefined, tenantId: string | undefined): (request: Request) => Promise<string | null> {
    return async (request) => {
        if (!expectedToken || expectedToken.length < 32 || !tenantId) return null; // not configured → fail closed
        const header = request.headers.get('Authorization') ?? '';
        const match = /^Bearer\s+(.+)$/i.exec(header);
        if (!match) return null;
        const [a, b] = await Promise.all([sha256(match[1]!.trim()), sha256(expectedToken)]);
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
        return diff === 0 ? tenantId : null;
    };
}

async function sha256(value: string): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
