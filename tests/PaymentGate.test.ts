import { describe, expect, it } from 'vitest';
import { ProcurementEngine } from '../src/core/procurement/ProcurementEngine.js';
import { isPaymentCleared, partitionByPayment } from '../src/core/procurement/PaymentGate.js';
import type { CustomerOrderLine, PaymentInfo, ProcurementPolicy, SupplierOffer } from '../src/core/procurement/types.js';

const paid: PaymentInfo = { paymentStatus: 'PAID', paymentMethod: 'CARD' };
const unpaid: PaymentInfo = { paymentStatus: 'UNPAID', paymentMethod: 'BANK_TRANSFER' };
const partial: PaymentInfo = { paymentStatus: 'PARTIALLY_PAID', paymentMethod: 'BANK_TRANSFER' };
const cod: PaymentInfo = { paymentStatus: 'COD', paymentMethod: 'COD' };
const codReportedUnpaid: PaymentInfo = { paymentStatus: 'UNPAID', paymentMethod: 'COD' };

const line = (id: string, quantity: number, ownStock: number, paymentInfo: PaymentInfo | undefined, createdAt = '2026-01-01T00:00:00Z'): CustomerOrderLine => ({
    id, orderId: `o-${id}`, productId: 'P', variantId: 'V', sku: 'P', quantity, ownStockQuantity: ownStock, createdAt, paymentInfo,
});
const offers: SupplierOffer[] = [{ supplierId: 'S', supplierSku: 'SP', productId: 'P', variantId: 'V', availableQuantity: 100, unitPrice: 10, currency: 'CZK', leadTimeDays: 2, active: true }];
const policy: ProcurementPolicy = { approvalMode: 'automatic' };
const ordered = (plan: ReturnType<typeof ProcurementEngine.plan>, lineId: string) =>
    plan.purchaseOrders.flatMap((po) => po.lines).filter((l) => l.customerOrderLineId === lineId).reduce((sum, l) => sum + l.quantity, 0);

describe('Platba: isPaymentCleared (výchozí pravidlo PAID nebo COD)', () => {
    it('zaplaceno a dobírka projdou', () => {
        expect(isPaymentCleared(paid)).toBe(true);
        expect(isPaymentCleared(cod)).toBe(true);
        expect(isPaymentCleared(codReportedUnpaid)).toBe(true);
    });
    it('nezaplaceno, částečně zaplaceno a chybějící údaj neprojdou', () => {
        expect(isPaymentCleared(unpaid)).toBe(false);
        expect(isPaymentCleared(partial)).toBe(false);
        expect(isPaymentCleared(undefined)).toBe(false);
    });
    it('e-shop může kontrolu vypnout nebo povolit částečnou platbu', () => {
        expect(isPaymentCleared(undefined, { enabled: false, allowedStatuses: [] })).toBe(true);
        expect(isPaymentCleared(partial, { enabled: true, allowedStatuses: ['PAID', 'COD', 'PARTIALLY_PAID'] })).toBe(true);
    });
    it('bez povolené dobírky neprojde ani dobírka hlášená jako UNPAID', () => {
        expect(isPaymentCleared(codReportedUnpaid, { enabled: true, allowedStatuses: ['PAID'] })).toBe(false);
    });
    it('partitionByPayment rozdělí položky pro vyskladnění', () => {
        const { cleared, awaitingPayment } = partitionByPayment([line('a', 1, 0, paid), line('b', 1, 0, unpaid)], (l) => l.paymentInfo);
        expect(cleared.map((l) => l.id)).toEqual(['a']);
        expect(awaitingPayment.map((l) => l.id)).toEqual(['b']);
    });
});

describe('Platba: plánování nákupu', () => {
    it('nezaplacená objednávka se u dodavatele neobjedná a je hlášena jako AWAITING_PAYMENT', () => {
        const plan = ProcurementEngine.plan([line('L1', 5, 0, unpaid)], offers, policy, 'e1');
        expect(plan.purchaseOrders).toHaveLength(0);
        expect(plan.unfulfilled).toEqual([expect.objectContaining({ customerOrderLineId: 'L1', quantity: 5, reason: 'AWAITING_PAYMENT' })]);
    });
    it('objednávka bez údaje o platbě se neobjedná (bezpečné výchozí chování)', () => {
        const plan = ProcurementEngine.plan([line('L1', 5, 0, undefined)], offers, policy, 'e1');
        expect(plan.purchaseOrders).toHaveLength(0);
        expect(plan.unfulfilled[0].reason).toBe('AWAITING_PAYMENT');
    });
    it('částečně zaplacená objednávka se neobjedná', () => {
        const plan = ProcurementEngine.plan([line('L1', 5, 0, partial)], offers, policy, 'e1');
        expect(plan.purchaseOrders).toHaveLength(0);
    });
    it('dobírka se objedná', () => {
        const plan = ProcurementEngine.plan([line('L1', 5, 0, cod)], offers, policy, 'e1');
        expect(ordered(plan, 'L1')).toBe(5);
    });
    it('nezaplacená starší objednávka neblokuje vlastní sklad zaplacené novější', () => {
        const plan = ProcurementEngine.plan([
            line('OLD_UNPAID', 3, 3, unpaid, '2026-01-01T00:00:00Z'),
            line('NEW_PAID', 3, 3, paid, '2026-01-02T00:00:00Z'),
        ], offers, policy, 'e1');
        expect(ordered(plan, 'NEW_PAID')).toBe(0); // pokryto vlastním skladem
        expect(ordered(plan, 'OLD_UNPAID')).toBe(0);
        expect(plan.unfulfilled.map((u) => u.customerOrderLineId)).toEqual(['OLD_UNPAID']);
    });
    it('po zaplacení se v dalším běhu objedná, už objednané se neobjedná znovu', () => {
        const run2 = ProcurementEngine.plan([line('L1', 5, 0, paid)], offers, policy, 'e2', new Map([['L1', 2]]));
        expect(ordered(run2, 'L1')).toBe(3);
    });
    it('vypnutá kontrola plateb (opt-out e-shopu) objedná i bez údaje o platbě', () => {
        const plan = ProcurementEngine.plan([line('L1', 5, 0, undefined)], offers, { ...policy, paymentGate: { enabled: false, allowedStatuses: [] } }, 'e1');
        expect(ordered(plan, 'L1')).toBe(5);
    });
});
