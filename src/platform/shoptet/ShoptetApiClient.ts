import type { ShoptetAccessTokenProvider } from './ShoptetAuth.js';

export class ShoptetApiError extends Error {
    public constructor(public readonly status: number, public readonly path: string, public readonly errorCode?: string) {
        super(`Shoptet API ${status}${errorCode ? ` (${errorCode})` : ''} ${path}`);
        this.name = 'ShoptetApiError';
    }
}

export interface ShoptetClientOptions {
    maxRetries?: number;
    maxPages?: number;
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
}

/**
 * Shoptet REST client for one installation (one e-shop).
 * - fresh API access token from the provider, one automatic renewal after 401 (expired token)
 * - retries 429 (rate limit), 423 (URL lock), 503 (maintenance) with Retry-After (seconds or HTTP date)
 * - requests are serialised per installation → never more than 1 of the 3 allowed connections per token
 * - tokens and response bodies are never put into error messages
 */
export class ShoptetApiClient {
    private queue: Promise<unknown> = Promise.resolve();

    public constructor(
        private readonly oauthAccessToken: string,
        private readonly tokens: ShoptetAccessTokenProvider,
        private readonly baseUrl = 'https://api.myshoptet.com',
        private readonly request: typeof fetch = fetch,
        private readonly options: ShoptetClientOptions = {},
    ) {
        if (!oauthAccessToken) throw new Error('Shoptet OAuth access token is required');
    }

    public get<T = Record<string, unknown>>(path: string, query: Record<string, string> = {}): Promise<T> {
        return this.enqueue(() => this.send<T>('GET', path, query));
    }

    public post<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
        return this.enqueue(() => this.send<T>('POST', path, {}, body));
    }

    /** Collects all pages of a list endpoint (`data.<collection>` + `data.paginator.pageCount`). */
    public async getAllPages<T = unknown>(path: string, collection: string, query: Record<string, string> = {}, itemsPerPage = 50): Promise<T[]> {
        const all: T[] = [];
        const maxPages = this.options.maxPages ?? 1_000;
        for (let page = 1; ; page++) {
            if (page > maxPages) throw new Error(`Shoptet pagination exceeded ${maxPages} pages for ${path}`);
            const data = await this.get<Record<string, unknown>>(path, { ...query, page: String(page), itemsPerPage: String(itemsPerPage) });
            const items = data[collection];
            if (!Array.isArray(items)) throw new Error(`Shoptet response has no ${collection} array (${path})`);
            all.push(...(items as T[]));
            const paginator = (data.paginator ?? {}) as Record<string, unknown>;
            const pageCount = Number(paginator.pageCount ?? page);
            if (items.length === 0 || !Number.isFinite(pageCount) || page >= pageCount) break;
        }
        return all;
    }

    private enqueue<T>(work: () => Promise<T>): Promise<T> {
        const next = this.queue.then(work, work);
        this.queue = next.catch(() => undefined);
        return next;
    }

    private async send<T>(method: string, path: string, query: Record<string, string>, body?: unknown): Promise<T> {
        if (!path.startsWith('/api/')) throw new Error('Shoptet path must start with /api/');
        const url = new URL(path, this.baseUrl);
        for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
        const maxRetries = this.options.maxRetries ?? 4;
        const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
        let renewedToken = false;

        for (let attempt = 0; ; attempt++) {
            const token = await this.tokens.get(this.oauthAccessToken);
            const init: RequestInit = {
                method,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/vnd.shoptet.v1.0',
                    'Shoptet-Access-Token': token,
                },
                signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            };
            const response = await this.request(url, init);

            if (response.status === 401 && !renewedToken) {
                renewedToken = true;
                await this.tokens.invalidate(this.oauthAccessToken);
                continue;
            }
            if ((response.status === 429 || response.status === 423 || response.status === 503) && attempt < maxRetries) {
                await sleep(Math.min(retryDelayMs(response.headers.get('Retry-After'), attempt, Date.now()), 60_000));
                continue;
            }
            const json = await response.json().catch(() => undefined) as { data?: unknown; errors?: Array<{ errorCode?: string }> | null } | undefined;
            if (!response.ok) throw new ShoptetApiError(response.status, path, json?.errors?.[0]?.errorCode);
            return (json?.data ?? {}) as T;
        }
    }
}

/** Retry-After may be delta-seconds or an HTTP date (Shoptet sends a date). */
export function retryDelayMs(header: string | null, attempt: number, now: number): number {
    const fallback = 1000 * 2 ** attempt;
    if (!header) return fallback;
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - now) || fallback;
    return fallback;
}
