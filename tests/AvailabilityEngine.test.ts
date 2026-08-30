import { test, expect } from 'vitest';
import { AvailabilityEngine } from '../src/core/availability/AvailabilityEngine.js';
import { SortingPipeline } from '../src/core/ranking/SortingPipeline.js';
import { AvailabilityStatus, ProductAvailabilityInput } from '../src/core/availability/types.js';

test('Case A: A IN, B OUT, C IN', () => {
    const products: ProductAvailabilityInput[] = [
        { id: 'A', variants: [{ id: 'v1', isPurchasable: true, inStock: true }] },
        { id: 'B', variants: [{ id: 'v2', isPurchasable: true, inStock: false }] },
        { id: 'C', variants: [{ id: 'v3', isPurchasable: true, inStock: true }] }
    ];
    
    const results = products.map(p => AvailabilityEngine.evaluate(p));
    const sorted = SortingPipeline.sort(results);
    
    expect(sorted.map(s => s.productId)).toEqual(['A', 'C', 'B']);
});

test('Case B: A OUT, B IN, C OUT, D IN', () => {
    const products: ProductAvailabilityInput[] = [
        { id: 'A', variants: [{ id: 'v1', isPurchasable: true, inStock: false }] },
        { id: 'B', variants: [{ id: 'v2', isPurchasable: true, inStock: true }] },
        { id: 'C', variants: [{ id: 'v3', isPurchasable: true, inStock: false }] },
        { id: 'D', variants: [{ id: 'v4', isPurchasable: true, inStock: true }] }
    ];
    
    const results = products.map(p => AvailabilityEngine.evaluate(p));
    const sorted = SortingPipeline.sort(results);
    
    expect(sorted.map(s => s.productId)).toEqual(['B', 'D', 'A', 'C']);
});

test('Case C: A: variant 1 OUT, variant 2 IN -> AVAILABLE (PARTIALLY)', () => {
    const p: ProductAvailabilityInput = {
        id: 'A',
        variants: [
            { id: 'v1', isPurchasable: true, inStock: false },
            { id: 'v2', isPurchasable: true, inStock: true }
        ]
    };
    
    const res = AvailabilityEngine.evaluate(p);
    expect(res.status).toBe(AvailabilityStatus.PARTIALLY_AVAILABLE);
});

test('Case D: A: variant 1 OUT, variant 2 OUT -> OUT_OF_STOCK', () => {
    const p: ProductAvailabilityInput = {
        id: 'A',
        variants: [
            { id: 'v1', isPurchasable: true, inStock: false },
            { id: 'v2', isPurchasable: true, inStock: false }
        ]
    };
    
    const res = AvailabilityEngine.evaluate(p);
    expect(res.status).toBe(AvailabilityStatus.OUT_OF_STOCK);
});

test('Case E: UNKNOWN is not classified as IN_STOCK', () => {
    // Missing variants
    const p: ProductAvailabilityInput = {
        id: 'A',
        variants: []
    };
    
    const res = AvailabilityEngine.evaluate(p);
    expect(res.status).toBe(AvailabilityStatus.UNKNOWN);
    expect(res.score).toBeLessThan(AvailabilityStatus.IN_STOCK ? 100 : 0); 
});

test('Case F: Pagination logic test (Mock sorting pages)', () => {
    // Sorting should be applied on the full dataset before paginating.
    // If only applied per page, it's incorrect.
    const fullDataset: ProductAvailabilityInput[] = [];
    for (let i = 0; i < 10; i++) {
        fullDataset.push({ id: `OUT_${i}`, variants: [{ id: 'v', isPurchasable: true, inStock: false }]});
    }
    for (let i = 0; i < 5; i++) {
        fullDataset.push({ id: `IN_${i}`, variants: [{ id: 'v', isPurchasable: true, inStock: true }]});
    }
    
    const evaluated = fullDataset.map(p => AvailabilityEngine.evaluate(p));
    const sorted = SortingPipeline.sort(evaluated);
    
    // Page 1 should contain all IN_STOCK first
    const page1 = sorted.slice(0, 10);
    expect(page1.filter(p => p.status === AvailabilityStatus.IN_STOCK).length).toBe(5);
});

test('Case G: Existing business sorting as secondary', () => {
    const products: ProductAvailabilityInput[] = [
        { id: 'A', baseSortPriority: 10, variants: [{ id: 'v', isPurchasable: true, inStock: true }] },
        { id: 'B', baseSortPriority: 50, variants: [{ id: 'v', isPurchasable: true, inStock: true }] }, // B should be before A
        { id: 'C', baseSortPriority: 100, variants: [{ id: 'v', isPurchasable: true, inStock: false }] } // C is OUT, so it should be last despite high priority
    ];
    
    const sorted = SortingPipeline.sort(products.map(p => AvailabilityEngine.evaluate(p)));
    expect(sorted.map(s => s.productId)).toEqual(['B', 'A', 'C']);
});
