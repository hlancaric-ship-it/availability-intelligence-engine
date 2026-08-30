import { AvailabilityEngine } from '../src/core/availability/AvailabilityEngine.js';
import { SortingPipeline } from '../src/core/ranking/SortingPipeline.js';
import { normalizeShoptetExportProduct } from '../src/platform/shoptet/normalizer/exportNormalizer.js';

// 1. INPUT (Simulated Shoptet NO-API CSV/XML Export JSON representation)
// Represents OK Fish products with different variant states
const inputExportData = [
    { 
        ProductGuid: 'okfish-guid-1', Code: 'NAST-KEITECH-1', TopRank: '50', 
        ParsedVariants: [
            { VariantGuid: 'v1', Purchasable: '1', Stock: '5', OnOrder: '0', InTransit: '0' },
            { VariantGuid: 'v2', Purchasable: '1', Stock: '1', OnOrder: '0', InTransit: '0' }
        ] // MIX: IN_STOCK (qty 5) + LOW_STOCK (qty 1) -> LOW_STOCK
    },
    { 
        ProductGuid: 'okfish-guid-2', Code: 'NAST-KEITECH-2', TopRank: '10', 
        ParsedVariants: [
            { VariantGuid: 'v3', Purchasable: '1', Stock: '0', OnOrder: '0', InTransit: '0' }
        ] // OUT_OF_STOCK
    },
    { 
        ProductGuid: 'okfish-guid-3', Code: 'NAST-KEITECH-3', TopRank: '99', 
        ParsedVariants: [
            { VariantGuid: 'v4', Purchasable: '1', Stock: '0', OnOrder: '1', InTransit: '0' },
            { VariantGuid: 'v5', Purchasable: '1', Stock: '0', OnOrder: '1', InTransit: '0' }
        ] // ON_ORDER
    },
    { 
        ProductGuid: 'okfish-guid-4', Code: 'NAST-KEITECH-4', TopRank: '20', 
        ParsedVariants: [
            { VariantGuid: 'v6', Purchasable: '1', Stock: '0', OnOrder: '0', InTransit: '1' }
        ] // IN_TRANSIT
    }
];

console.log("=== SHOPTET UNIVERSAL INTEGRATION: DRY RUN ===");
console.log(`Input items: ${inputExportData.length}\n`);

// 2. NORMALIZE
const normalized = inputExportData.map(normalizeShoptetExportProduct);

// 3. AVAILABILITY
const evaluated = normalized.map(p => AvailabilityEngine.evaluate(p));

// 4. SORT
const sorted = SortingPipeline.sort(evaluated);

// 5. INTERNAL READ MODEL (not a Shoptet update)
const finalPriorityList = sorted.map((result, index) => ({ guid: result.productId, status: result.status, internalRank: index + 1 }));

console.log("=== INTERNAL AVAILABILITY RANKING ===");
console.table(finalPriorityList);
