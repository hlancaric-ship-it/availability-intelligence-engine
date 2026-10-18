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

test('Shoptet client retries on 429 respecting Retry-After', async () => {
    let n = 0;
    const waits: number[] = [];
    const client = new ShoptetReadOnlyClient('read-token', 'https://shop.example', async () => {
        n++;
        if (n === 1) return new Response('', { status: 429, headers: { 'Retry-After': '2' } });
        return new Response(JSON.stringify({ data: { stocks: [], paginator: { pageCount: 1 } } }), { status: 200 });
    }, { sleep: async (ms) => { waits.push(ms); } });
    await expect(client.listStocks()).resolves.toEqual([]);
    expect(waits).toEqual([2000]);
});
