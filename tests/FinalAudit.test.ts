import { test, expect } from 'vitest';
import { AvailabilityEngine } from '../src/core/availability/AvailabilityEngine.js';
import { AvailabilityStatus, VariantAvailability } from '../src/core/availability/types.js';

const v = (inStock: boolean, isPurchasable: boolean = true, stockAmount?: number, inTransit?: boolean, onOrder?: boolean): VariantAvailability => ({
    id: Math.random().toString(36),
    inStock, isPurchasable, stockAmount, inTransit, onOrder
});

test('Invariant 1: Order invariance', () => {
    const v1 = v(true, true, 5); // IN_STOCK
    const v2 = v(false, true, 0, false, false); // OUT_OF_STOCK
    
    const res1 = AvailabilityEngine.evaluate({ id: '1', variants: [v1, v2] });
    const res2 = AvailabilityEngine.evaluate({ id: '2', variants: [v2, v1] });
    expect(res1.status).toBe(res2.status);
    expect(res1.status).toBe(AvailabilityStatus.PARTIALLY_AVAILABLE);
});

test('Invariant 2: LOW_STOCK_THRESHOLD exactness', () => {
    const r1 = AvailabilityEngine.evaluate({ id: '1', variants: [v(true, true, 1)] });
    const r3 = AvailabilityEngine.evaluate({ id: '3', variants: [v(true, true, 3)] });
    const r4 = AvailabilityEngine.evaluate({ id: '4', variants: [v(true, true, 4)] });
    
    expect(r1.status).toBe(AvailabilityStatus.LOW_STOCK);
    expect(r3.status).toBe(AvailabilityStatus.LOW_STOCK);
    expect(r4.status).toBe(AvailabilityStatus.IN_STOCK);
});

test('Invariant 3: LOW_STOCK + IN_STOCK => LOW_STOCK', () => {
    const res = AvailabilityEngine.evaluate({ id: '1', variants: [v(true, true, 2), v(true, true, 10)] });
    expect(res.status).toBe(AvailabilityStatus.LOW_STOCK);
});

test('Invariant 4: LOW_STOCK + OUT_OF_STOCK => PARTIALLY_AVAILABLE', () => {
    const res = AvailabilityEngine.evaluate({ id: '1', variants: [v(true, true, 2), v(false, false)] });
    expect(res.status).toBe(AvailabilityStatus.PARTIALLY_AVAILABLE);
});

test('Invariant 5: IN_TRANSIT with stockAmount = 0 -> never IN_STOCK/LOW_STOCK', () => {
    const res = AvailabilityEngine.evaluate({ id: '1', variants: [v(false, true, 0, true, false)] });
    expect(res.status).toBe(AvailabilityStatus.IN_TRANSIT);
});

test('Invariant 8: Runtime-invalid values (negative stock)', () => {
    const res = AvailabilityEngine.evaluate({ id: '1', variants: [v(true, true, -5)] });
    expect(res.status).toBe(AvailabilityStatus.IN_STOCK);
});
