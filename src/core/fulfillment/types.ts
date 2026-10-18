import type { PaymentGatePolicy, PaymentInfo } from '../procurement/types.js';

/**
 * Lifecycle of a customer order inside the warehouse (platform-neutral).
 *
 *   WAITING_FOR_STOCK ─▶ AWAITING_PAYMENT ─▶ READY_TO_PACK ─▶ PACKING ─▶ PACKED ─▶ SHIPPED
 *            any non-shipped state ─▶ CANCELLED
 *
 * WAITING_FOR_STOCK and AWAITING_PAYMENT are the "safety lock": while in them, packing and shipping are refused.
 */
export type FulfillmentStatus =
    | 'WAITING_FOR_STOCK'
    | 'AWAITING_PAYMENT'
    | 'READY_TO_PACK'
    | 'PACKING'
    | 'PACKED'
    | 'SHIPPED'
    | 'CANCELLED';

export interface FulfillmentLine {
    customerOrderLineId: string;
    productId: string;
    variantId: string;
    sku: string;
    /** EAN / barcode. Scans match EAN or SKU. */
    ean?: string;
    orderedQuantity: number;
    /** Units physically available for this order (own stock reserved + received from suppliers). */
    allocatedQuantity: number;
    /** Part of allocatedQuantity that comes from OWN stock (set by procurement planning, absolute). Default 0. */
    ownStockAllocated?: number;
    /** Units confirmed by scanner into the parcel. */
    packedQuantity: number;
}

export interface FulfillmentOrder {
    orderId: string;
    status: FulfillmentStatus;
    lines: FulfillmentLine[];
    paymentInfo?: PaymentInfo | undefined;
    trackingNumber?: string | undefined;
    carrier?: string | undefined;
    shippedAt?: string | undefined;
    /** Optimistic locking: repositories must reject saves with a stale version. */
    version: number;
}

export interface FulfillmentPolicy {
    /**
     * false (default) = only complete parcels may be packed and shipped ("safety lock").
     * true = units already allocated may be shipped even if part of the order is still missing.
     */
    allowPartialShipment: boolean;
    paymentGate?: PaymentGatePolicy;
}

export const DEFAULT_FULFILLMENT_POLICY: FulfillmentPolicy = Object.freeze({ allowPartialShipment: false });

export type FulfillmentBlocker = 'INCOMPLETE' | 'AWAITING_PAYMENT' | 'CANCELLED' | 'ALREADY_SHIPPED';

export type ScanError =
    | 'INVALID_CODE'
    /** Code does not belong to any line of this order (wrong product / colour / size). */
    | 'WRONG_PRODUCT'
    /** Line is already fully packed – the scanned unit is one too many. */
    | 'OVER_QUANTITY'
    /** Order is locked (incomplete, unpaid, cancelled or shipped). */
    | 'NOT_RELEASED';

export type ScanResult =
    | { ok: true; customerOrderLineId: string; sku: string; packedQuantity: number; targetQuantity: number; orderPacked: boolean }
    | { ok: false; error: ScanError; code: string; blockers?: FulfillmentBlocker[] };
