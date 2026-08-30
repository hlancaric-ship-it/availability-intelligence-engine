import { expect, test } from 'vitest';
import { ShoptetReadOnlyClient } from '../src/platform/shoptet/api/ShoptetReadOnlyClient.js';

test('Shoptet client only issues paginated GET requests', async () => {
    const calls: RequestInit[] = [];
    const client = new ShoptetReadOnlyClient('read-token', 'https://shop.example', async (_url, init) => {
        calls.push(init!);
        return new Response(JSON.stringify({ data: { orders: [{ code: 'A' }], paginator: { pageCount: 1 } } }), { status: 200 });
    });
    await expect(client.listOrders()).resolves.toEqual([{ code: 'A' }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.headers).toMatchObject({ 'Shoptet-Access-Token': 'read-token' });
});
