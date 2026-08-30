import { test, expect, describe } from 'vitest';
import { AvailabilityEngine } from '../src/core/availability/AvailabilityEngine.js';
import { SortingPipeline } from '../src/core/ranking/SortingPipeline.js';
import { AvailabilityStatus, ProductAvailabilityInput, VariantAvailability } from '../src/core/availability/types.js';

describe('B) Availability Semantics & Boundary Cases', () => {
    
    // HELPER to create variants quickly
    const v = (inStock: boolean, onOrder: boolean, isPurchasable: boolean = true, inTransit: boolean = false, stockAmount?: number): VariantAvailability => ({
        id: Math.random().toString(36),
        inStock,
        onOrder,
        isPurchasable,
        inTransit,
        stockAmount
    });
    
    // BOUNDARY CASES MATRIX
    const fixtures: Record<string, ProductAvailabilityInput> = {
        'Product A: 1 IN_STOCK, 1 OUT_OF_STOCK': {
            id: 'PROD_A', baseSortPriority: 0, relevanceScore: 0,
            variants: [v(true, false), v(false, false)]
        },
        'Product B: ALL OUT_OF_STOCK': {
            id: 'PROD_B', baseSortPriority: 0, relevanceScore: 0,
            variants: [v(false, false), v(false, false)]
        },
        'Product C: 1 IN_TRANSIT, 1 OUT_OF_STOCK': {
            id: 'PROD_C', baseSortPriority: 0, relevanceScore: 0,
            variants: [v(false, false, true, true), v(false, false)]
        },
        'Product D: ALL UNKNOWN (missing variant data)': {
            id: 'PROD_D', baseSortPriority: 0, relevanceScore: 0,
            variants: []
        },
        'Product E: ALL STATES MIXED': {
            id: 'PROD_E', baseSortPriority: 0, relevanceScore: 0,
            // IN_STOCK, LOW_STOCK, IN_TRANSIT, ON_ORDER, OUT_OF_STOCK
            variants: [
                v(true, false, true, false, 10), 
                v(true, false, true, false, 2), 
                v(false, false, true, true), 
                v(false, true, true), 
                v(false, false)
            ]
        },
        'Product F: ALL LOW_STOCK': {
            id: 'PROD_F', baseSortPriority: 0, relevanceScore: 0,
            variants: [v(true, false, true, false, 1), v(true, false, true, false, 3)]
        },
        'Product G: IN_STOCK + LOW_STOCK': {
            id: 'PROD_G', baseSortPriority: 0, relevanceScore: 0,
            variants: [v(true, false, true, false, 10), v(true, false, true, false, 2)]
        },
        'Product H: IN_TRANSIT + ON_ORDER': {
            id: 'PROD_H', baseSortPriority: 0, relevanceScore: 0,
            variants: [v(false, false, true, true), v(false, true, true)]
        }
    };

    test('Same input -> same availability result & same sorting position', () => {
        const eval1 = AvailabilityEngine.evaluate(fixtures['Product A: 1 IN_STOCK, 1 OUT_OF_STOCK']);
        const eval2 = AvailabilityEngine.evaluate(fixtures['Product A: 1 IN_STOCK, 1 OUT_OF_STOCK']);
        
        expect(eval1.status).toBe(eval2.status);
        expect(eval1.score).toBe(eval2.score);
        
        const sorted = SortingPipeline.sort([eval1, eval2]);
        expect(sorted[0].score).toBe(sorted[1].score);
    });

    test('Product A: 1 IN_STOCK, 1 OUT_OF_STOCK -> PARTIALLY_AVAILABLE', () => {
        const res = AvailabilityEngine.evaluate(fixtures['Product A: 1 IN_STOCK, 1 OUT_OF_STOCK']);
        expect(res.status).toBe(AvailabilityStatus.PARTIALLY_AVAILABLE);
        expect(res.score).toBe(75);
    });

    test('Product B: ALL OUT_OF_STOCK -> OUT_OF_STOCK', () => {
        const res = AvailabilityEngine.evaluate(fixtures['Product B: ALL OUT_OF_STOCK']);
        expect(res.status).toBe(AvailabilityStatus.OUT_OF_STOCK);
        expect(res.score).toBe(0);
    });

    test('Product C: 1 IN_TRANSIT, 1 OUT_OF_STOCK -> IN_TRANSIT', () => {
        const res = AvailabilityEngine.evaluate(fixtures['Product C: 1 IN_TRANSIT, 1 OUT_OF_STOCK']);
        expect(res.status).toBe(AvailabilityStatus.IN_TRANSIT);
        expect(res.score).toBe(60);
    });

    test('Product D: 0 variants (Fallback for ALL UNKNOWN) -> UNKNOWN', () => {
        const res = AvailabilityEngine.evaluate(fixtures['Product D: ALL UNKNOWN (missing variant data)']);
        expect(res.status).toBe(AvailabilityStatus.UNKNOWN);
        expect(res.score).toBe(-1);
    });

    test('Product E: MIXED STATES -> PARTIALLY_AVAILABLE', () => {
        const res = AvailabilityEngine.evaluate(fixtures['Product E: ALL STATES MIXED']);
        expect(res.status).toBe(AvailabilityStatus.PARTIALLY_AVAILABLE);
        expect(res.score).toBe(75);
    });
    
    test('Product F: ALL LOW_STOCK -> LOW_STOCK (Score 90)', () => {
        const res = AvailabilityEngine.evaluate(fixtures['Product F: ALL LOW_STOCK']);
        expect(res.status).toBe(AvailabilityStatus.LOW_STOCK);
        expect(res.score).toBe(90);
    });

    test('Product G: IN_STOCK + LOW_STOCK -> LOW_STOCK (Score 90)', () => {
        const res = AvailabilityEngine.evaluate(fixtures['Product G: IN_STOCK + LOW_STOCK']);
        expect(res.status).toBe(AvailabilityStatus.LOW_STOCK);
        expect(res.score).toBe(90);
    });

    test('Product H: IN_TRANSIT + ON_ORDER -> IN_TRANSIT (Score 60)', () => {
        const res = AvailabilityEngine.evaluate(fixtures['Product H: IN_TRANSIT + ON_ORDER']);
        expect(res.status).toBe(AvailabilityStatus.IN_TRANSIT);
        expect(res.score).toBe(60);
    });

    test('Boundary: Unpurchasable IN_STOCK variant behaves as OUT_OF_STOCK', () => {
        const res = AvailabilityEngine.evaluate({
            id: 'PROD_UNPURCHASABLE',
            variants: [v(true, false, false)]
        });
        expect(res.status).toBe(AvailabilityStatus.OUT_OF_STOCK);
    });
});
