import type { FulfillmentLine } from '../../core/fulfillment/types.js';
import type { CustomerOrderLine, PaymentInfo, PaymentMethod } from '../../core/procurement/types.js';

/** Subset of GET /api/orders/{code} → data.order that the add-on uses (no customer personal data). */
export interface ShoptetOrder {
    code: string;
    creationTime?: string;
    status?: { id?: number; name?: string };
    paid?: boolean | null;
    billingMethod?: { id?: number; name?: string } | null;
    cashDeskOrder?: boolean;
    items?: ShoptetOrderItem[];
}

export interface ShoptetOrderItem {
    itemId?: number | string;
    itemType?: string;
    productGuid?: string | null;
    code?: string | null;
    ean?: string | null;
    amount?: number | string;
}

/** Item types that are physical goods to purchase / pack. Shipping, billing, discounts, gifts etc. are ignored. */
const GOODS_ITEM_TYPES = new Set(['product', 'bazar', 'product-set-item']);

/** Shoptet code list "Invoice billing methods": 1 COD, 2 wire transfer, 3 cash, 4 card. */
const BILLING_METHOD: Record<number, PaymentMethod> = { 1: 'COD', 2: 'BANK_TRANSFER', 4: 'CARD' };

export const SHOPTET_CANCELLED_STATUS_ID = -4;

/**
 * Payment state for the payment gate.
 * - `paid: true` → PAID
 * - billing method COD and not paid → UNPAID + method COD (gate allows it when COD is permitted)
 * - everything else → UNPAID. Cash (3) is deliberately NOT treated as COD: the shop must confirm it as paid.
 */
export function mapShoptetPayment(order: Pick<ShoptetOrder, 'paid' | 'billingMethod'>): PaymentInfo {
    const method = BILLING_METHOD[order.billingMethod?.id ?? -1] ?? 'BANK_TRANSFER';
    return { paymentStatus: order.paid === true ? 'PAID' : 'UNPAID', paymentMethod: method };
}

export interface MappedOrderLine { line: Omit<CustomerOrderLine, 'ownStockQuantity'>; ean?: string }
export interface MappedOrder { orderId: string; cancelled: boolean; paymentInfo: PaymentInfo; lines: MappedOrderLine[]; skipped: Array<{ itemId: string; reason: string }> }

/** Pure mapping Shoptet order → platform-neutral lines. Lines that cannot be purchased safely are reported, not guessed. */
export function mapShoptetOrder(order: ShoptetOrder): MappedOrder {
    if (!order.code) throw new Error('Shoptet order without code');
    const paymentInfo = mapShoptetPayment(order);
    const lines: MappedOrderLine[] = [];
    const skipped: MappedOrder['skipped'] = [];
    for (const item of order.items ?? []) {
        const itemId = String(item.itemId ?? '');
        if (!GOODS_ITEM_TYPES.has(item.itemType ?? '')) continue;
        if (!itemId) { skipped.push({ itemId: '?', reason: 'missing itemId' }); continue; }
        // productGuid / code may be null when the product was deleted or re-coded after ordering (Shoptet docs).
        if (!item.productGuid || !item.code) { skipped.push({ itemId, reason: 'product no longer identifiable (deleted or re-coded)' }); continue; }
        const quantity = Number(item.amount);
        if (!Number.isInteger(quantity) || quantity <= 0) { skipped.push({ itemId, reason: `non-integer or invalid amount "${String(item.amount)}"` }); continue; }
        lines.push({
            line: {
                id: `${order.code}:${itemId}`,
                orderId: order.code,
                productId: item.productGuid,
                // Shoptet identifies variants by their unique code; there is no separate variant GUID on order items.
                variantId: item.code,
                sku: item.code,
                quantity,
                createdAt: normaliseTime(order.creationTime),
                paymentInfo,
            },
            ...(item.ean ? { ean: item.ean } : {}),
        });
    }
    return { orderId: order.code, cancelled: order.status?.id === SHOPTET_CANCELLED_STATUS_ID, paymentInfo, lines, skipped };
}

/** For FulfillmentService.upsertOrder (warehouse). Allocation starts at 0 – it is set by procurement/receipts. */
export function toFulfillmentLines(mapped: MappedOrder): FulfillmentLine[] {
    return mapped.lines.map(({ line, ean }) => ({
        customerOrderLineId: line.id,
        productId: line.productId,
        variantId: line.variantId,
        sku: line.sku,
        ...(ean ? { ean } : {}),
        orderedQuantity: line.quantity,
        allocatedQuantity: 0,
        packedQuantity: 0,
    }));
}

/** "2018-05-29T09:02:27+0200" → ISO 8601 UTC. */
export function normaliseTime(value: string | undefined): string {
    if (!value) return new Date(0).toISOString();
    const fixed = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const t = Date.parse(fixed);
    return Number.isFinite(t) ? new Date(t).toISOString() : new Date(0).toISOString();
}
