/**
 * Concrete Shoptet transport with a hard GET-only invariant. The token needs only
 * read permissions; the client has no method capable of sending a mutation.
 */
export class ShoptetReadOnlyClient {
    public constructor(
        private readonly accessToken: string,
        private readonly baseUrl = 'https://api.myshoptet.com',
        private readonly request: typeof fetch = fetch,
    ) {}

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
        for (let page = 1; ; page++) {
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
        const response = await this.request(url, { method: 'GET', headers: { Accept: 'application/json', 'Shoptet-Access-Token': this.accessToken } });
        if (!response.ok) throw new Error(`Shoptet read failed: ${response.status}`);
        return response.json() as Promise<{ data: unknown }>;
    }

    private object(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Shoptet response');
        return value as Record<string, unknown>;
    }
}
