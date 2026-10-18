/**
 * @deprecated Superseded by ../ShoptetApiClient.ts (token renewal, 423 handling, per-token serialisation).
 * Kept only for the no-API import tooling and its tests.
 *
 * Concrete Shoptet transport with a hard GET-only invariant. The token needs only
 * read permissions; the client has no method capable of sending a mutation.
 */
export class ShoptetReadOnlyClient {
    public constructor(
        private readonly accessToken: string,
        private readonly baseUrl = 'https://api.myshoptet.com',
        private readonly request: typeof fetch = fetch,
        private readonly options: { maxRetries?: number; maxPages?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
    ) {
        if (!accessToken) throw new Error('Shoptet access token is required');
    }

    public async listOrders(query: Record<string, string> = {}): Promise<unknown[]> {
        return this.getPages('/api/orders', query, 'orders');
    }

    public async listProducts(query: Record<string, string> = {}): Promise<unknown[]> {
        return this.getPages('/api/products', query, 'products');
    }

    public async listStocks(query: Record<string, string> = {}): Promise<unknown[]> {
        return this.getPages('/api/stocks', query, 'stocks');
    }

    private async getPages(path: string, query: Record<string, string>, collection: string): Promise<unknown[]> {
        const all: unknown[] = [];
        const maxPages = this.options.maxPages ?? 10_000;
        for (let page = 1; ; page++) {
            if (page > maxPages) throw new Error(`Shoptet pagination exceeded ${maxPages} pages`);
            const response = await this.get(path, { ...query, page: String(page), itemsPerPage: '50' });
            const data = this.object(response.data);
            const items = data[collection];
            if (!Array.isArray(items)) throw new Error(`Shoptet response has no ${collection} array`);
            all.push(...items);
            const paginator = this.object(data.paginator);
            if (items.length === 0 || page >= Number(paginator.pageCount ?? paginator.pagesCount ?? page)) break;
        }
        return all;
    }

    private async get(path: string, query: Record<string, string>): Promise<{ data: unknown }> {
        const url = new URL(path, this.baseUrl);
        Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
        const maxRetries = this.options.maxRetries ?? 3;
        const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
        for (let attempt = 0; ; attempt++) {
            const init: RequestInit = { method: 'GET', headers: { Accept: 'application/json', 'Content-Type': 'application/vnd.shoptet.v1.0', 'Shoptet-Access-Token': this.accessToken } };
            if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) init.signal = AbortSignal.timeout(this.options.timeoutMs ?? 30_000);
            const response = await this.request(url, init);
            // Respect Shoptet API rate limiting (429) and transient outages (503) with bounded backoff.
            if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
                const delayMs = this.retryDelayMs(response.headers.get('Retry-After'), attempt);
                await sleep(Math.min(delayMs, 60_000));
                continue;
            }
            // Never include the URL/token in the error message.
            if (!response.ok) throw new Error(`Shoptet read failed: ${response.status} ${path}`);
            return response.json() as Promise<{ data: unknown }>;
        }
    }

    /** Retry-After may be delta-seconds or an HTTP date (Shoptet SDK documents a "Retry-After date"). */
    private retryDelayMs(header: string | null, attempt: number): number {
        const fallback = 1000 * 2 ** attempt;
        if (!header) return fallback;
        const seconds = Number(header);
        if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
        const date = Date.parse(header);
        if (Number.isFinite(date)) return Math.max(0, date - Date.now()) || fallback;
        return fallback;
    }

    private object(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Shoptet response');
        return value as Record<string, unknown>;
    }
}
