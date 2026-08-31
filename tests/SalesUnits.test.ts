import { describe, it, expect } from 'vitest';
import type { SalesUnit, PackagingDepositRule } from '../src/core/sales-units/types.js';
import { ConversionEngine } from '../src/core/sales-units/ConversionEngine.js';
import { OrderQuantityValidator } from '../src/core/sales-units/OrderQuantityValidator.js';
import { PackagingDepositEngine } from '../src/core/sales-units/PackagingDepositEngine.js';
import { SalesUnitEngine } from '../src/core/sales-units/SalesUnitEngine.js';
import type { CustomerOrderLine, SupplierOffer, ProcurementPolicy } from '../src/core/procurement/types.js';
import { ProcurementEngine } from '../src/core/procurement/ProcurementEngine.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BAG: SalesUnit = {
    id: 'su-bag',
    productId: 'cement',
    name: 'Pytel',
    code: 'BAG',
    baseQuantity: 1,
    baseUnit: 'PCS',
    weightPerBaseUnitGrams: 25_000, // 25 kg in grams
    priceMultiplier: 1,
    minimumQuantity: 1,
    orderStep: 1,
    active: true,
};

const PALLET: SalesUnit = {
    id: 'su-pallet',
    productId: 'cement',
    name: 'Paleta',
    code: 'PALLET',
    baseQuantity: 42,
    baseUnit: 'PCS',
    weightPerBaseUnitGrams: 25_000,
    priceMultiplier: 1,
    minimumQuantity: 1,
    orderStep: 1,
    active: true,
};

const CONTAINER: SalesUnit = {
    id: 'su-container',
    productId: 'cement',
    name: 'Kontejner',
    code: 'CONTAINER',
    baseQuantity: 840,
    baseUnit: 'PCS',
    weightPerBaseUnitGrams: 25_000,
    priceMultiplier: 1,
    minimumQuantity: 1,
    orderStep: 1,
    active: true,
};

const PALLET_DEPOSIT: PackagingDepositRule = {
    id: 'dep-eur-pallet',
    salesUnitId: 'su-pallet',
    packagingType: 'EURO_PALLET',
    depositAmount: 250,
    currency: 'CZK',
    quantityPerSalesUnit: 1,
    refundable: true,
    active: true,
};

// ─── ConversionEngine ─────────────────────────────────────────────────────────

describe('ConversionEngine — toBaseQuantity', () => {
    it('1 PALLET → 42 PCS', () => {
        expect(ConversionEngine.toBaseQuantity(PALLET, 1).baseQuantity).toBe(42);
    });
    it('3 PALLET → 126 PCS', () => {
        expect(ConversionEngine.toBaseQuantity(PALLET, 3).baseQuantity).toBe(126);
    });
    it('1 CONTAINER → 840 PCS', () => {
        expect(ConversionEngine.toBaseQuantity(CONTAINER, 1).baseQuantity).toBe(840);
    });
    it('2 CONTAINER → 1680 PCS', () => {
        expect(ConversionEngine.toBaseQuantity(CONTAINER, 2).baseQuantity).toBe(1680);
    });
    it('1 BAG → 1 PCS', () => {
        expect(ConversionEngine.toBaseQuantity(BAG, 1).baseQuantity).toBe(1);
    });
    it('throws on fractional quantity', () => {
        expect(() => ConversionEngine.toBaseQuantity(PALLET, 1.5)).toThrow();
    });
    it('throws on zero quantity', () => {
        expect(() => ConversionEngine.toBaseQuantity(PALLET, 0)).toThrow();
    });
    it('throws on negative quantity', () => {
        expect(() => ConversionEngine.toBaseQuantity(PALLET, -1)).toThrow();
    });
});

describe('ConversionEngine — fromBaseQuantity', () => {
    it('50 PCS → 1 PALLET (floor)', () => {
        expect(ConversionEngine.fromBaseQuantity(PALLET, 50)).toBe(1);
    });
    it('84 PCS → 2 PALLET', () => {
        expect(ConversionEngine.fromBaseQuantity(PALLET, 84)).toBe(2);
    });
    it('0 PCS → 0 PALLET', () => {
        expect(ConversionEngine.fromBaseQuantity(PALLET, 0)).toBe(0);
    });
    it('throws on negative baseQuantity', () => {
        expect(() => ConversionEngine.fromBaseQuantity(PALLET, -1)).toThrow();
    });
});

// ─── Weight ───────────────────────────────────────────────────────────────────

describe('Weight calculation', () => {
    it('1 PALLET: 42 PCS × 25 kg = 1 050 kg (1 050 000 g)', () => {
        expect(ConversionEngine.toBaseQuantity(PALLET, 1).totalWeightGrams).toBe(1_050_000);
    });
    it('1 CONTAINER: 840 PCS × 25 kg = 21 000 kg (21 000 000 g)', () => {
        expect(ConversionEngine.toBaseQuantity(CONTAINER, 1).totalWeightGrams).toBe(21_000_000);
    });
    it('2 PALLET: 84 PCS × 25 kg = 2 100 kg (2 100 000 g)', () => {
        const r = ConversionEngine.toBaseQuantity(PALLET, 2);
        expect(r.baseQuantity).toBe(84);
        expect(r.totalWeightGrams).toBe(2_100_000);
    });
    it('1 BAG = 25 kg (25 000 g)', () => {
        expect(ConversionEngine.toBaseQuantity(BAG, 1).totalWeightGrams).toBe(25_000);
    });
});

// ─── OrderQuantityValidator — BAG (MOQ=1, step=1) ────────────────────────────

describe('OrderQuantityValidator — BAG (minimumQuantity=1, orderStep=1)', () => {
    it('1 → valid', () => expect(OrderQuantityValidator.validate(BAG, 1).valid).toBe(true));
    it('100 → valid', () => expect(OrderQuantityValidator.validate(BAG, 100).valid).toBe(true));
});

// ─── OrderQuantityValidator — PALLET with MOQ=42, step=42 ────────────────────

describe('OrderQuantityValidator — PALLET_MOQ (minimumQuantity=42, orderStep=42)', () => {
    const PALLET_MOQ: SalesUnit = { ...PALLET, minimumQuantity: 42, orderStep: 42 };

    it('42 → valid', () => expect(OrderQuantityValidator.validate(PALLET_MOQ, 42).valid).toBe(true));
    it('84 → valid', () => expect(OrderQuantityValidator.validate(PALLET_MOQ, 84).valid).toBe(true));
    it('126 → valid', () => expect(OrderQuantityValidator.validate(PALLET_MOQ, 126).valid).toBe(true));
    it('168 → valid', () => expect(OrderQuantityValidator.validate(PALLET_MOQ, 168).valid).toBe(true));

    it('1 → invalid BELOW_MINIMUM, suggest 42', () => {
        const r = OrderQuantityValidator.validate(PALLET_MOQ, 1);
        expect(r.valid).toBe(false);
        expect(r.reason).toBe('BELOW_MINIMUM');
        expect(r.suggestedQuantity).toBe(42);
    });
    it('20 → invalid BELOW_MINIMUM', () => {
        const r = OrderQuantityValidator.validate(PALLET_MOQ, 20);
        expect(r.valid).toBe(false);
        expect(r.reason).toBe('BELOW_MINIMUM');
    });
    it('41 → invalid BELOW_MINIMUM', () => {
        const r = OrderQuantityValidator.validate(PALLET_MOQ, 41);
        expect(r.valid).toBe(false);
        expect(r.reason).toBe('BELOW_MINIMUM');
    });
    it('43 → invalid INVALID_ORDER_STEP, suggest 84', () => {
        const r = OrderQuantityValidator.validate(PALLET_MOQ, 43);
        expect(r.valid).toBe(false);
        expect(r.reason).toBe('INVALID_ORDER_STEP');
        expect(r.suggestedQuantity).toBe(84);
    });
    it('45 → invalid INVALID_ORDER_STEP, suggest 84', () => {
        const r = OrderQuantityValidator.validate(PALLET_MOQ, 45);
        expect(r.valid).toBe(false);
        expect(r.reason).toBe('INVALID_ORDER_STEP');
        expect(r.suggestedQuantity).toBe(84);
    });
    it('inactive unit → INACTIVE_SALES_UNIT', () => {
        const r = OrderQuantityValidator.validate({ ...PALLET_MOQ, active: false }, 42);
        expect(r.valid).toBe(false);
        expect(r.reason).toBe('INACTIVE_SALES_UNIT');
    });
});

// ─── PackagingDepositEngine ───────────────────────────────────────────────────

describe('PackagingDepositEngine', () => {
    it('2 PALLET → 2 × 250 CZK = 500 CZK', () => {
        const charges = PackagingDepositEngine.calculate([PALLET_DEPOSIT], 2);
        expect(charges).toHaveLength(1);
        const c = charges[0]!;
        expect(c.quantity).toBe(2);
        expect(c.totalAmount).toBe(500);
        expect(c.refundable).toBe(true);
        expect(c.currency).toBe('CZK');
    });
    it('1 PALLET → 1 × 250 CZK = 250 CZK', () => {
        const charges = PackagingDepositEngine.calculate([PALLET_DEPOSIT], 1);
        expect(charges[0]!.totalAmount).toBe(250);
    });
    it('inactive rule → no charge', () => {
        expect(PackagingDepositEngine.calculate([{ ...PALLET_DEPOSIT, active: false }], 2)).toHaveLength(0);
    });
    it('throws on invalid salesUnitQuantity', () => {
        expect(() => PackagingDepositEngine.calculate([PALLET_DEPOSIT], 0)).toThrow();
    });
    it('multiple deposit rules summed independently', () => {
        const rule2: PackagingDepositRule = { ...PALLET_DEPOSIT, id: 'r2', packagingType: 'FOIL', depositAmount: 50 };
        const charges = PackagingDepositEngine.calculate([PALLET_DEPOSIT, rule2], 3);
        expect(charges).toHaveLength(2);
        expect(charges.find(c => c.packagingType === 'EURO_PALLET')!.totalAmount).toBe(750);
        expect(charges.find(c => c.packagingType === 'FOIL')!.totalAmount).toBe(150);
    });
});

// ─── SalesUnitEngine — availability by sales unit ────────────────────────────

describe('SalesUnitEngine.getAvailabilityBySalesUnit', () => {
    it('50 PCS stock → 50 BAG, 1 PALLET, 0 CONTAINER', () => {
        const results = SalesUnitEngine.getAvailabilityBySalesUnit({
            ownStockBaseQuantity: 50,
            salesUnits: [BAG, PALLET, CONTAINER],
        });
        const bag = results.find(r => r.salesUnitCode === 'BAG')!;
        const pallet = results.find(r => r.salesUnitCode === 'PALLET')!;
        const container = results.find(r => r.salesUnitCode === 'CONTAINER')!;
        expect(bag.salesUnitQuantityAvailable).toBe(50);
        expect(pallet.salesUnitQuantityAvailable).toBe(1);
        expect(pallet.baseQuantityAvailable).toBe(42);
        expect(container.salesUnitQuantityAvailable).toBe(0);
    });
    it('inactive sales unit excluded from results', () => {
        const results = SalesUnitEngine.getAvailabilityBySalesUnit({
            ownStockBaseQuantity: 100,
            salesUnits: [BAG, { ...PALLET, active: false }],
        });
        expect(results.find(r => r.salesUnitCode === 'PALLET')).toBeUndefined();
    });
    it('pricing: 1 PALLET = 42 PCS × 20 CZK = 840 CZK ex VAT', () => {
        const results = SalesUnitEngine.getAvailabilityBySalesUnit({
            ownStockBaseQuantity: 84,
            salesUnits: [PALLET],
            basePriceExVat: 20,
            vatRate: 0.21,
            currency: 'CZK',
        });
        const r = results[0]!;
        expect(r.pricing?.unitPriceExVat).toBe(840);
        expect(r.pricing?.pricePerBaseUnit).toBe(20);
        expect(r.pricing?.currency).toBe('CZK');
        expect(r.pricing?.unitPriceIncVat).toBeCloseTo(1016.4);
    });
    it('weight: 1 PALLET available → 42 × 25 000 g = 1 050 000 g', () => {
        const results = SalesUnitEngine.getAvailabilityBySalesUnit({
            ownStockBaseQuantity: 50,
            salesUnits: [PALLET],
        });
        expect(results[0]!.totalWeightGrams).toBe(1_050_000);
    });
});

// ─── SalesUnitEngine — normaliseToProcurementDemand ──────────────────────────

describe('SalesUnitEngine.normaliseToProcurementDemand', () => {
    it('2 PALLET, 50 PCS stock → deficit 34 PCS', () => {
        const r = SalesUnitEngine.normaliseToProcurementDemand(PALLET, 2, 50);
        expect(r.canonicalQuantity).toBe(84);
        expect(r.canonicalOwnStock).toBe(50);
        expect(r.deficit).toBe(34);
    });
    it('1 CONTAINER, 0 stock → deficit 840', () => {
        const r = SalesUnitEngine.normaliseToProcurementDemand(CONTAINER, 1, 0);
        expect(r.canonicalQuantity).toBe(840);
        expect(r.deficit).toBe(840);
    });
    it('1 PALLET, 100 stock → deficit 0', () => {
        const r = SalesUnitEngine.normaliseToProcurementDemand(PALLET, 1, 100);
        expect(r.deficit).toBe(0);
    });
});

// ─── End-to-End: Cement Definition of Done ───────────────────────────────────

describe('End-to-end: Cement Definition of Done', () => {
    it('2 PALLET, 50 PCS stock, A=20 B=30 → A=20, B=14, total=34', () => {
        // 1. Normalise
        const norm = SalesUnitEngine.normaliseToProcurementDemand(PALLET, 2, 50);
        expect(norm.canonicalQuantity).toBe(84);
        expect(norm.deficit).toBe(34);

        // 2. Weight
        const conv = ConversionEngine.toBaseQuantity(PALLET, 2);
        expect(conv.totalWeightGrams).toBe(2_100_000); // 2 100 kg

        // 3. Procurement
        const demand: CustomerOrderLine = {
            id: 'order-cement-1',
            orderId: 'ord-cement-1',
            productId: 'cement',
            variantId: 'cement-bag',
            sku: 'CEMENT-BAG',
            quantity: norm.canonicalQuantity,
            ownStockQuantity: norm.canonicalOwnStock,
            createdAt: '2026-01-01T00:00:00Z',
        };
        const offers: SupplierOffer[] = [
            { supplierId: 'supplier-a', supplierSku: 'CEM-A', productId: 'cement', variantId: 'cement-bag', availableQuantity: 20, unitPrice: 19, currency: 'CZK', leadTimeDays: 2, active: true, supplierPriority: 1 },
            { supplierId: 'supplier-b', supplierSku: 'CEM-B', productId: 'cement', variantId: 'cement-bag', availableQuantity: 30, unitPrice: 21, currency: 'CZK', leadTimeDays: 3, active: true, supplierPriority: 2 },
        ];
        const policy: ProcurementPolicy = { approvalMode: 'automatic' };
        const plan = ProcurementEngine.plan([demand], offers, policy, 'evt-cement-001');

        expect(plan.unfulfilled).toHaveLength(0);
        const allLines = plan.purchaseOrders.flatMap(po => po.lines);
        const totalProcured = allLines.reduce((s, l) => s + l.quantity, 0);
        expect(totalProcured).toBe(34);
        expect(allLines.find(l => l.supplierId === 'supplier-a')?.quantity).toBe(20);
        expect(allLines.find(l => l.supplierId === 'supplier-b')?.quantity).toBe(14);

        // 4. Deposit
        const deposits = PackagingDepositEngine.calculate([PALLET_DEPOSIT], 2);
        expect(deposits[0]!.totalAmount).toBe(500);
        expect(deposits[0]!.refundable).toBe(true);
    });

    it('partial stock: 84 PCS own stock covers 2 PALLET exactly → no procurement', () => {
        const norm = SalesUnitEngine.normaliseToProcurementDemand(PALLET, 2, 84);
        expect(norm.deficit).toBe(0);
        const demand: CustomerOrderLine = {
            id: 'order-full-stock',
            orderId: 'ord-full',
            productId: 'cement',
            variantId: 'cement-bag',
            sku: 'CEMENT-BAG',
            quantity: norm.canonicalQuantity,
            ownStockQuantity: norm.canonicalOwnStock,
            createdAt: '2026-01-01T00:00:00Z',
        };
        const plan = ProcurementEngine.plan([demand], [], { approvalMode: 'automatic' }, 'evt-full');
        expect(plan.purchaseOrders).toHaveLength(0);
        expect(plan.unfulfilled).toHaveLength(0);
    });

    it('idempotency: same demand processed twice yields same result', () => {
        const norm = SalesUnitEngine.normaliseToProcurementDemand(PALLET, 2, 50);
        const demand: CustomerOrderLine = {
            id: 'order-idem',
            orderId: 'ord-idem',
            productId: 'cement',
            variantId: 'cement-bag',
            sku: 'CEMENT-BAG',
            quantity: norm.canonicalQuantity,
            ownStockQuantity: norm.canonicalOwnStock,
            createdAt: '2026-01-01T00:00:00Z',
        };
        const offers: SupplierOffer[] = [
            { supplierId: 'sup-x', supplierSku: 'X', productId: 'cement', variantId: 'cement-bag', availableQuantity: 100, unitPrice: 20, currency: 'CZK', leadTimeDays: 1, active: true },
        ];
        const policy: ProcurementPolicy = { approvalMode: 'automatic' };
        const qty1 = ProcurementEngine.plan([demand], offers, policy, 'evt-idem-1').purchaseOrders.flatMap(p => p.lines).reduce((s, l) => s + l.quantity, 0);
        const qty2 = ProcurementEngine.plan([demand], offers, policy, 'evt-idem-2').purchaseOrders.flatMap(p => p.lines).reduce((s, l) => s + l.quantity, 0);
        expect(qty1).toBe(34);
        expect(qty2).toBe(34);
    });
});

// ─── Regression: existing AvailabilityEngine not broken ──────────────────────

describe('Regression: existing AvailabilityEngine unaffected', () => {
    it('AvailabilityEngine still importable and functional', async () => {
        const { AvailabilityEngine } = await import('../src/core/availability/AvailabilityEngine.js');
        expect(AvailabilityEngine).toBeDefined();
        const result = AvailabilityEngine.evaluate({
            id: 'p1',
            variants: [{ id: 'v1', isPurchasable: true, inStock: true, stockAmount: 10 }],
        });
        expect(result).toBeDefined();
        expect(result.status).toBe('IN_STOCK');
    });
});
