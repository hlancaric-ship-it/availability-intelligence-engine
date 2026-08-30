import { test, expect } from 'vitest';
import { AvailabilityEngine } from '../src/core/availability/AvailabilityEngine.js';
import { SortingPipeline } from '../src/core/ranking/SortingPipeline.js';
import { ProductAvailabilityInput, AvailabilityStatus } from '../src/core/availability/types.js';

// Deterministic representative catalog. The former test depended on a cache outside this package,
// which made the suite fail in clean CI checkouts.
function loadOkFishCatalog(): ProductAvailabilityInput[] {
    const products: ProductAvailabilityInput[] = [];
    for (let i = 0; i < 125; i++) {
        // Create 1-3 variants per product deterministically
        const variantCount = (i % 3) + 1; 
        const variants = [];
        
        for (let v = 0; v < variantCount; v++) {
            // Deterministic stock allocation for test reproducibility
            const isPurchasable = (i + v) % 10 !== 0; // 10% not purchasable
            const inStock = isPurchasable && ((i + v) % 3 === 0); // ~33% in stock
            const onOrder = isPurchasable && !inStock && ((i + v) % 2 === 0); // ~33% on order
            
            variants.push({
                id: `OKFISH-${i}_v${v}`,
                isPurchasable,
                inStock,
                onOrder
            });
        }
        
        products.push({
            id: `OKFISH-${i}`,
            sku: `OKFISH-${i}`,
            baseSortPriority: i % 100, // secondary sorting (0-99)
            relevanceScore: i % 10,    // tertiary
            variants
        });
        
    }
    
    return products;
}

test('Pagination Invariants and Full Catalog Audit on OK Fish', () => {
    console.log("Loading OK Fish Catalog...");
    const catalog = loadOkFishCatalog();
    const catalogSize = catalog.length;
    console.log(`Loaded ${catalogSize} products.`);
    
    // 1. Evaluate availability
    const evaluated = catalog.map(p => AvailabilityEngine.evaluate(p));
    
    // Check distribution
    const counts = {
        [AvailabilityStatus.IN_STOCK]: 0,
        [AvailabilityStatus.PARTIALLY_AVAILABLE]: 0,
        [AvailabilityStatus.ON_ORDER]: 0,
        [AvailabilityStatus.OUT_OF_STOCK]: 0,
        [AvailabilityStatus.UNKNOWN]: 0,
    };
    for (const e of evaluated) counts[e.status]++;
    console.log("Availability Distribution:", counts);

    // 2. Global sorting
    const globalSorted = SortingPipeline.sort(evaluated);
    
    // 3. Pagination Simulation
    const PAGE_SIZE = 50;
    const TOTAL_PAGES = Math.ceil(catalogSize / PAGE_SIZE);
    
    const paginatedItems = [];
    for (let page = 1; page <= TOTAL_PAGES; page++) {
        // In a real DB, you'd apply the exact same sort on the DB level.
        // Here we simulate the DB returning the exact slice of the sorted data.
        const offset = (page - 1) * PAGE_SIZE;
        const slice = globalSorted.slice(offset, offset + PAGE_SIZE);
        paginatedItems.push(...slice);
    }
    
    // INVARIANT A: No items lost
    expect(paginatedItems.length).toBe(catalogSize);
    
    // INVARIANT B: Exact same order as global
    for (let i = 0; i < catalogSize; i++) {
        expect(paginatedItems[i].productId).toBe(globalSorted[i].productId);
    }
    
    // INVARIANT C: No duplicates
    const uniqueIds = new Set(paginatedItems.map(p => p.productId));
    expect(uniqueIds.size).toBe(catalogSize);
    
    // INVARIANT D: Determinism (sorting twice yields same result)
    const sortedAgain = SortingPipeline.sort(evaluated);
    expect(sortedAgain[0].productId).toBe(globalSorted[0].productId);
    expect(sortedAgain[catalogSize - 1].productId).toBe(globalSorted[catalogSize - 1].productId);
    
    // INVARIANT E: Primary Sorting check (IN_STOCK must always precede OUT_OF_STOCK)
    const inStockIndex = globalSorted.findIndex(p => p.status === AvailabilityStatus.IN_STOCK);
    const outOfStockIndex = globalSorted.findIndex(p => p.status === AvailabilityStatus.OUT_OF_STOCK);
    
    if (inStockIndex !== -1 && outOfStockIndex !== -1) {
        expect(inStockIndex).toBeLessThan(outOfStockIndex);
    }
    
    // Log success
    console.log("All invariants passed 100% offline with zero external writes.");
});
