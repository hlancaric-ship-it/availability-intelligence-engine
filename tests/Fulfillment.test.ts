import { describe, expect, it, vi } from 'vitest';
import { FulfillmentEngine, FulfillmentLockedError } from '../src/core/fulfillment/FulfillmentEngine.js';
import { ConcurrentModificationError, FulfillmentService, runBulk } from '../src/core/fulfillment/FulfillmentService.js';
import type { FulfillmentRepositoryPort, PaymentStatusPort } from '../src/core/fulfillment/FulfillmentService.js';
import { ReceivingSession } from '../src/core/fulfillment/ReceivingSession.js';
import type { FulfillmentOrder, FulfillmentPolicy } from '../src/core/fulfillment/types.js';
import { ProcurementWorkflow } from '../src/core/procurement/Workflow.js';
import type { PaymentInfo, PurchaseOrder } from '../src/core/procurement/types.js';

const PAID: PaymentInfo = { paymentStatus: 'PAID', paymentMethod: 'CARD' };
const UNPAID: PaymentInfo = { paymentStatus: 'UNPAID', paymentMethod: 'BANK_TRANSFER' };
const STRICT: FulfillmentPolicy = { allowPartialShipment: false };
const PARTIAL: FulfillmentPolicy = { allowPartialShipment: true };

const order = (over: Partial<FulfillmentOrder> = {}): FulfillmentOrder => ({
    orderId: 'O1',
    status: 'WAITING_FOR_STOCK',
    version: 1,
    paymentInfo: PAID,
    lines: [
        { customerOrderLineId: 'L1', productId: 'P1', variantId: 'RED-M', sku: 'TRIKO-RED-M', ean: '8590000000011', orderedQuantity: 2, allocatedQuantity: 2, packedQuantity: 0 },
        { customerOrderLineId: 'L2', productId: 'P1', variantId: 'BLUE-M', sku: 'TRIKO-BLUE-M', ean: '8590000000028', orderedQuantity: 1, allocatedQuantity: 0, packedQuantity: 0 },
    ],
    ...over,
});

class MemoryRepo implements FulfillmentRepositoryPort {
    public readonly store = new Map<string, FulfillmentOrder>();
    private k(t: string, id: string) { return `${t}\u0000${id}`; }
    public async get(t: string, id: string) { return structuredClone(this.store.get(this.k(t, id))); }
    public async findByCustomerLineIds(t: string, ids: string[]) {
        return [...this.store.entries()].filter(([key, o]) => key.startsWith(`${t}\u0000`) && o.lines.some((l) => ids.includes(l.customerOrderLineId))).map(([, o]) => structuredClone(o));
    }
    public async listByStatus(t: string, statuses: FulfillmentOrder['status'][], limit: number) {
        return [...this.store.entries()].filter(([key, o]) => key.startsWith(`${t}\u0000`) && statuses.includes(o.status)).slice(0, limit).map(([, o]) => structuredClone(o));
    }
    public async save(t: string, o: FulfillmentOrder) {
        const current = this.store.get(this.k(t, o.orderId));
        if ((current?.version ?? 0) !== o.version) throw new ConcurrentModificationError(o.orderId);
        const saved = { ...structuredClone(o), version: o.version + 1 };
        this.store.set(this.k(t, o.orderId), saved);
        return structuredClone(saved);
    }
}

const setup = (payment: PaymentInfo | undefined = PAID, policy: FulfillmentPolicy = STRICT) => {
    const repo = new MemoryRepo();
    const payments: PaymentStatusPort = { getPaymentInfo: vi.fn().mockResolvedValue(payment) };
    const audit = { append: vi.fn().mockResolvedValue(undefined) };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const service = new FulfillmentService(repo, payments, audit, logger, () => policy, () => '2026-10-18T10:00:00.000Z');
    return { repo, payments, audit, logger, service };
};
const incoming = (o: FulfillmentOrder) => ({ orderId: o.orderId, lines: o.lines, paymentInfo: o.paymentInfo });
const auditTypes = (audit: { append: ReturnType<typeof vi.fn> }) => audit.append.mock.calls.map((c) => c[0].type);

describe('Bezpečnostní zámek (FulfillmentEngine)', () => {
    it('neúplná objednávka čeká na zboží a nejde balit', () => {
        const o = FulfillmentEngine.evaluate(order());
        expect(o.status).toBe('WAITING_FOR_STOCK');
        expect(FulfillmentEngine.scanForPacking(o, '8590000000011').result).toMatchObject({ ok: false, error: 'NOT_RELEASED', blockers: ['INCOMPLETE'] });
    });
    it('kompletní, ale nezaplacená objednávka je zamčená kvůli platbě', () => {
        const o = FulfillmentEngine.applyAllocations(order({ paymentInfo: UNPAID }), [{ customerOrderLineId: 'L2', allocatedQuantity: 1, fulfilled: true }]);
        expect(o.status).toBe('AWAITING_PAYMENT');
        expect(FulfillmentEngine.blockers(o)).toEqual(['AWAITING_PAYMENT']);
    });
    it('kompletní a zaplacená objednávka je připravená k balení', () => {
        const o = FulfillmentEngine.applyAllocations(order(), [{ customerOrderLineId: 'L2', allocatedQuantity: 1, fulfilled: true }]);
        expect(o.status).toBe('READY_TO_PACK');
    });
    it('přidělení nikdy nepřesáhne objednané množství a neznámé řádky ignoruje', () => {
        const o = FulfillmentEngine.applyAllocations(order(), [{ customerOrderLineId: 'L2', allocatedQuantity: 5, fulfilled: true }, { customerOrderLineId: 'X', allocatedQuantity: 1, fulfilled: true }]);
        expect(o.lines[1]!.allocatedQuantity).toBe(1);
    });
    it('s povolenou částečnou expedicí lze zabalit a odeslat jen to, co je skladem', () => {
        let o = FulfillmentEngine.evaluate(order(), PARTIAL);
        expect(o.status).toBe('READY_TO_PACK');
        o = FulfillmentEngine.scanForPacking(o, '8590000000011', PARTIAL).order;
        o = FulfillmentEngine.scanForPacking(o, '8590000000011', PARTIAL).order;
        expect(o.status).toBe('PACKED');
        expect(FulfillmentEngine.ship(o, 't', PARTIAL).status).toBe('SHIPPED');
    });
    it('vstup se nikdy nemění (immutability)', () => {
        const o = order();
        const snapshot = structuredClone(o);
        FulfillmentEngine.applyAllocations(o, [{ customerOrderLineId: 'L2', allocatedQuantity: 1, fulfilled: true }]);
        expect(o).toEqual(snapshot);
    });
});

describe('Balení skenerem', () => {
    const ready = () => FulfillmentEngine.applyAllocations(order(), [{ customerOrderLineId: 'L2', allocatedQuantity: 1, fulfilled: true }]);

    it('správné kusy podle EAN i SKU (bez ohledu na mezery a velikost písmen) zabalí objednávku', () => {
        let o = ready();
        let r = FulfillmentEngine.scanForPacking(o, ' 8590000000011 ');
        expect(r.result).toMatchObject({ ok: true, packedQuantity: 1, targetQuantity: 2, orderPacked: false });
        o = r.order;
        expect(o.status).toBe('PACKING');
        o = FulfillmentEngine.scanForPacking(o, 'triko-red-m').order;
        r = FulfillmentEngine.scanForPacking(o, '8590000000028');
        expect(r.result).toMatchObject({ ok: true, orderPacked: true });
        expect(r.order.status).toBe('PACKED');
    });
    it('špatný produkt (jiná barva) je odmítnut a nic se nezmění', () => {
        const o = ready();
        const r = FulfillmentEngine.scanForPacking(o, 'TRIKO-GREEN-M');
        expect(r.result).toMatchObject({ ok: false, error: 'WRONG_PRODUCT' });
        expect(r.order.lines.every((l) => l.packedQuantity === 0)).toBe(true);
    });
    it('kus navíc je odmítnut (OVER_QUANTITY)', () => {
        let o = ready();
        o = FulfillmentEngine.scanForPacking(o, '8590000000028').order;
        expect(FulfillmentEngine.scanForPacking(o, '8590000000028').result).toMatchObject({ ok: false, error: 'OVER_QUANTITY' });
    });
    it('prázdný kód je INVALID_CODE', () => {
        expect(FulfillmentEngine.scanForPacking(ready(), '   ').result).toMatchObject({ ok: false, error: 'INVALID_CODE' });
    });
    it('nezabalenou objednávku nelze odeslat, zamčenou taky ne', () => {
        expect(() => FulfillmentEngine.ship(ready(), 't')).toThrow(/not packed/);
        expect(() => FulfillmentEngine.ship(order(), 't')).toThrow(FulfillmentLockedError);
    });
    it('odeslanou objednávku nelze zrušit, zrušenou nelze balit', () => {
        expect(FulfillmentEngine.scanForPacking(FulfillmentEngine.cancel(ready()), '8590000000011').result).toMatchObject({ ok: false, error: 'NOT_RELEASED', blockers: ['CANCELLED'] });
        expect(() => FulfillmentEngine.cancel({ ...ready(), status: 'SHIPPED' })).toThrow();
    });
});

describe('FulfillmentService', () => {
    it('markReadyToShip po naskladnění odemkne objednávku a zapíše audit', async () => {
        const { repo, service, audit } = setup();
        await service.upsertOrder('t1', incoming(order()));
        await service.markReadyToShip('t1', [{ customerOrderLineId: 'L2', allocatedQuantity: 1, fulfilled: true }]);
        expect((await repo.get('t1', 'O1'))!.status).toBe('READY_TO_PACK');
        expect(auditTypes(audit)).toContain('FULFILLMENT_ALLOCATED');
    });
    it('přidělení pro neznámý řádek se zaloguje a zaaudituje, ale nespadne', async () => {
        const { service, audit, logger } = setup();
        await service.markReadyToShip('t1', [{ customerOrderLineId: 'NOPE', allocatedQuantity: 1, fulfilled: true }]);
        expect(logger.warn).toHaveBeenCalled();
        expect(auditTypes(audit)).toContain('FULFILLMENT_UNKNOWN_ALLOCATION');
    });
    it('e-shopy jsou oddělené: přidělení v t2 neovlivní objednávku v t1', async () => {
        const { repo, service } = setup();
        await service.upsertOrder('t1', incoming(order()));
        await service.markReadyToShip('t2', [{ customerOrderLineId: 'L2', allocatedQuantity: 1, fulfilled: true }]);
        expect((await repo.get('t1', 'O1'))!.status).toBe('WAITING_FOR_STOCK');
    });
    it('při prvním skenu se platba ověří znovu u platformy – zrušená platba balení zastaví', async () => {
        const { service, payments, audit } = setup(UNPAID);
        await service.upsertOrder('t1', incoming(order({ lines: order().lines.map((l) => ({ ...l, allocatedQuantity: l.orderedQuantity })) })));
        const r = await service.scanForPacking('t1', 'O1', '8590000000011');
        expect(payments.getPaymentInfo).toHaveBeenCalledWith('t1', 'O1');
        expect(r).toMatchObject({ ok: false, error: 'NOT_RELEASED', blockers: ['AWAITING_PAYMENT'] });
        expect(auditTypes(audit)).toContain('PACKING_SCAN_REJECTED');
    });
    it('celý průběh: sken → zabaleno → odesláno, s ověřením platby před odesláním', async () => {
        const { repo, service, payments, audit } = setup();
        await service.upsertOrder('t1', incoming(order({ lines: order().lines.map((l) => ({ ...l, allocatedQuantity: l.orderedQuantity })) })));
        for (const code of ['8590000000011', '8590000000011', '8590000000028']) expect((await service.scanForPacking('t1', 'O1', code)).ok).toBe(true);
        expect((await repo.get('t1', 'O1'))!.status).toBe('PACKED');
        const shipped = await service.ship('t1', 'O1', { carrier: 'zasilkovna', trackingNumber: 'Z123' });
        expect(shipped).toMatchObject({ status: 'SHIPPED', carrier: 'zasilkovna', trackingNumber: 'Z123', shippedAt: '2026-10-18T10:00:00.000Z' });
        expect(vi.mocked(payments.getPaymentInfo).mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(auditTypes(audit)).toEqual(expect.arrayContaining(['ORDER_PACKED', 'ORDER_SHIPPED']));
        // idempotent
        expect((await service.ship('t1', 'O1')).status).toBe('SHIPPED');
    });
    it('odeslání zamčené objednávky se zaaudituje jako SHIPPING_BLOCKED', async () => {
        const { service, audit } = setup();
        await service.upsertOrder('t1', incoming(order()));
        await expect(service.ship('t1', 'O1')).rejects.toBeInstanceOf(FulfillmentLockedError);
        expect(auditTypes(audit)).toContain('SHIPPING_BLOCKED');
    });
    it('souběžná úprava stejné objednávky je odmítnuta (optimistic locking)', async () => {
        const { repo, service } = setup();
        await service.upsertOrder('t1', incoming(order()));
        const stale = (await repo.get('t1', 'O1'))!;
        await service.cancel('t1', 'O1');
        await expect(repo.save('t1', stale)).rejects.toBeInstanceOf(ConcurrentModificationError);
    });
    it('aktualizace z platformy nesníží už přidělené ani zabalené kusy a nezmění odeslanou objednávku', async () => {
        const { repo, service } = setup();
        await service.upsertOrder('t1', incoming(order()));
        await service.markReadyToShip('t1', [{ customerOrderLineId: 'L2', allocatedQuantity: 1, fulfilled: true }]);
        await service.upsertOrder('t1', incoming(order()));
        expect((await repo.get('t1', 'O1'))!.lines[1]!.allocatedQuantity).toBe(1);
    });
    it('neplatná data z platformy jsou odmítnuta', async () => {
        const { service } = setup();
        await expect(service.upsertOrder('t1', { orderId: 'O1', lines: [] })).rejects.toThrow(/no lines/);
        await expect(service.upsertOrder('t1', incoming(order({ lines: [{ ...order().lines[0]!, orderedQuantity: 0 }] })))).rejects.toThrow(/positive integer/);
    });
    it('hromadné odeslání: každá objednávka zvlášť, chyba jedné nezastaví ostatní', async () => {
        const { repo, service } = setup();
        const full = order({ lines: [{ ...order().lines[0]!, orderedQuantity: 1, allocatedQuantity: 1 }] });
        await service.upsertOrder('t1', incoming(full));
        await service.upsertOrder('t1', incoming({ ...order(), orderId: 'O2', lines: order().lines.map((l) => ({ ...l, customerOrderLineId: `O2-${l.customerOrderLineId}` })) }));
        await service.scanForPacking('t1', 'O1', '8590000000011');
        const results = await service.shipMany('t1', ['O1', 'O2', 'O1']);
        expect(results).toEqual([{ id: 'O1', ok: true }, { id: 'O2', ok: false, error: expect.stringMatching(/locked/) }]);
        expect((await repo.get('t1', 'O1'))!.status).toBe('SHIPPED');
    });
    it('seznam k zabalení obsahuje jen odemčené objednávky daného e-shopu', async () => {
        const { service } = setup();
        await service.upsertOrder('t1', incoming(order({ lines: [{ ...order().lines[0]!, allocatedQuantity: 2 }] })));
        await service.upsertOrder('t1', incoming({ ...order(), orderId: 'O2', lines: [{ ...order().lines[1]!, customerOrderLineId: 'X2' }] }));
        await service.upsertOrder('t2', incoming({ ...order(), orderId: 'O3', lines: [{ ...order().lines[0]!, customerOrderLineId: 'Y', allocatedQuantity: 2 }] }));
        expect((await service.listReadyToPack('t1')).map((o) => o.orderId)).toEqual(['O1']);
    });
});

describe('runBulk', () => {
    it('odmítne příliš mnoho položek', async () => {
        await expect(runBulk(Array.from({ length: 3 }, (_, i) => String(i)), async () => undefined, 2)).rejects.toThrow(/limited/);
    });
});

describe('Příjem zboží skenerem (ReceivingSession)', () => {
    const po = (id: string, status: PurchaseOrder['status'], lines: Array<[string, string, number, number]>): PurchaseOrder => ({
        id, supplierId: 'S', status,
        lines: lines.map(([lineId, customerLine, quantity, received]) => ({ id: lineId, supplierId: 'S', customerOrderLineId: customerLine, productId: 'P', variantId: 'V', sku: 'SKU-1', supplierSku: 'SUP-1', quantity, receivedQuantity: received, unitPrice: 1, currency: 'CZK', expectedLeadTimeDays: 1 })),
    });

    it('přiřadí kusy nejdřív nejstaršímu nákupu, pak dalšímu; pozná EAN, SKU i kód dodavatele', () => {
        const session = new ReceivingSession([po('PO-OLD', 'SENT', [['a', 'L-old', 1, 0]]), po('PO-NEW', 'PARTIALLY_RECEIVED', [['b', 'L-new', 3, 1]])], (sku) => (sku === 'SKU-1' ? ['8591234567890'] : undefined));
        expect(session.scan('8591234567890')).toMatchObject({ ok: true, purchaseOrderId: 'PO-OLD', remainingForLine: 0 });
        expect(session.scan('sup-1')).toMatchObject({ ok: true, purchaseOrderId: 'PO-NEW', remainingForLine: 1 });
        expect(session.scan('SKU-1')).toMatchObject({ ok: true, purchaseOrderId: 'PO-NEW', remainingForLine: 0 });
        expect(session.scan('SKU-1')).toMatchObject({ ok: false, error: 'OVER_RECEIPT' });
        expect(session.toReceipt()).toEqual([
            { purchaseOrderId: 'PO-OLD', procurementLineId: 'a', receivedQuantity: 1 },
            { purchaseOrderId: 'PO-NEW', procurementLineId: 'b', receivedQuantity: 2 },
        ]);
    });
    it('nečekané zboží a zrušené/nepotvrzené nákupy odmítne', () => {
        const session = new ReceivingSession([po('PO-X', 'CANCELLED', [['a', 'L', 1, 0]]), po('PO-D', 'DRAFT', [['b', 'L', 1, 0]])]);
        expect(session.scan('SKU-1')).toMatchObject({ ok: false, error: 'UNEXPECTED_PRODUCT' });
        expect(session.scan('')).toMatchObject({ ok: false, error: 'INVALID_CODE' });
    });
    it('undo vrátí jeden naskenovaný kus', () => {
        const session = new ReceivingSession([po('PO', 'SENT', [['a', 'L', 2, 0]])]);
        session.scan('SKU-1');
        expect(session.undo('a')).toBe(true);
        expect(session.undo('a')).toBe(false);
        expect(session.toReceipt()).toEqual([]);
    });
});

describe('Hromadné schválení nákupů', () => {
    it('schválí každý nákup zvlášť a chyba jednoho nezastaví ostatní', async () => {
        const purchaseOrders = {
            approve: vi.fn(async (_t: string, id: string) => { if (id === 'BAD') throw new Error('not pending'); }),
            getOrdersByIds: vi.fn(async (_t: string, ids: string[]) => ids.map((id) => ({ id, supplierId: 'S', status: 'PENDING_APPROVAL', lines: [] }))),
            markAsSent: vi.fn(),
        };
        const idempotency = { claim: vi.fn().mockResolvedValue(true), complete: vi.fn(), fail: vi.fn() };
        const wf = new ProcurementWorkflow({} as never, {} as never, purchaseOrders as never, { dispatchPurchaseOrder: vi.fn().mockResolvedValue({ externalId: 'E' }) } as never, {} as never, idempotency, { append: vi.fn() }, { info: vi.fn(), warn: vi.fn(), error: vi.fn() });
        const results = await wf.approvePurchaseOrders('t1', 'bulk-1', ['A', 'BAD', 'B']);
        expect(results.map((r) => r.ok)).toEqual([true, false, true]);
        expect(idempotency.claim).toHaveBeenCalledWith('t1:bulk-1:A', 'APPROVE_PO');
    });
});
