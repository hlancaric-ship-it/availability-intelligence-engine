import { test, expect } from 'vitest';
import { ShoptetApiIntegration } from '../src/platform/shoptet/api/ShoptetApiIntegration.js';
import { ShoptetImportIntegration } from '../src/platform/shoptet/import/ShoptetImportIntegration.js';
import { TenantConfig } from '../src/tenants/configuration.js';

const okFishTenant: TenantConfig = {
    tenantId: 'okfish_reference',
    platform: 'shoptet',
    integrationMode: 'api',
    enabled: true
};

const dummyTenant: TenantConfig = {
    tenantId: 'dummy_new_client',
    platform: 'shoptet',
    integrationMode: 'import',
    enabled: true
};

// Raw Mock Data for API
const apiMockData = [
    { guid: 'guid1', code: 'PROD1', bestsellerRank: 50, variants: [{ guid: 'v1', purchasable: true, stock: 5 }] }, // IN_STOCK
    { guid: 'guid2', code: 'PROD2', bestsellerRank: 10, variants: [{ guid: 'v2', purchasable: true, stock: 0 }] }, // OUT_OF_STOCK
    { guid: 'guid3', code: 'PROD3', bestsellerRank: 99, variants: [{ guid: 'v3', purchasable: true, stock: 0, canPreorder: true }] }, // ON_ORDER
    { guid: 'guid4', code: 'PROD4', bestsellerRank: 20, variants: [{ guid: 'v4', purchasable: true, stock: 2 }] }  // LOW_STOCK
];

// Raw Mock Data for CSV/XML Export (Semantically identical to apiMockData)
const exportMockData = [
    { ProductGuid: 'guid1', Code: 'PROD1', TopRank: '50', ParsedVariants: [{ VariantGuid: 'v1', Purchasable: '1', Stock: '5', OnOrder: '0', InTransit: '0' }] },
    { ProductGuid: 'guid2', Code: 'PROD2', TopRank: '10', ParsedVariants: [{ VariantGuid: 'v2', Purchasable: '1', Stock: '0', OnOrder: '0', InTransit: '0' }] },
    { ProductGuid: 'guid3', Code: 'PROD3', TopRank: '99', ParsedVariants: [{ VariantGuid: 'v3', Purchasable: '1', Stock: '0', OnOrder: '1', InTransit: '0' }] },
    { ProductGuid: 'guid4', Code: 'PROD4', TopRank: '20', ParsedVariants: [{ VariantGuid: 'v4', Purchasable: '1', Stock: '2', OnOrder: '0', InTransit: '0' }] }
];

test('Test A & C: OK Fish API Path === Export Path', async () => {
    const apiEngine = new ShoptetApiIntegration();
    const importEngine = new ShoptetImportIntegration();
    
    const apiResult = await apiEngine.process(okFishTenant, apiMockData);
    const importResult = await importEngine.process(okFishTenant, exportMockData);
    
    // Validate order is correct
    // 1. IN_STOCK (guid1, score 100, rank 50)
    // 2. LOW_STOCK (guid4, score 90, rank 20)
    // 3. ON_ORDER (guid3, score 40, rank 99)
    // 4. OUT_OF_STOCK (guid2, score 0, rank 10)
    expect(apiResult.map(r => r.guid)).toEqual(['guid1', 'guid4', 'guid3', 'guid2']);
    
    // Must be identical
    expect(apiResult).toEqual(importResult);
});

test('Test D: Secondary Tenant (No OK Fish dependency)', async () => {
    const importEngine = new ShoptetImportIntegration();
    const result = await importEngine.process(dummyTenant, exportMockData);
    expect(result.map(r => r.guid)).toEqual(['guid1', 'guid4', 'guid3', 'guid2']);
});
