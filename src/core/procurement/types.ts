export type PaymentStatus = 'PAID' | 'UNPAID' | 'COD' | 'PARTIALLY_PAID';
export type PaymentMethod = 'CARD' | 'BANK_TRANSFER' | 'COD' | 'PAYPAL';

/**
 * Platform-neutral payment state of a customer order. Every platform adapter (Shoptet API, CSV import,
 * other platforms) must normalize its own payment states into this shape. Never put card numbers,
 * bank accounts or other payment credentials here.
 */
export interface PaymentInfo {
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    paidAmount?: number;
    totalAmount?: number;
}

export interface ParcelPackage {
    packageId: string;
    packageNumber: number; // e.g. 1 of 2
    totalPackages: number;
    carrier: string;
    trackingNumber: string;
    weightKg: number;
    isAdditional: boolean; // dodatečný štítek (reklamace / ztráta)
    reason?: string;
    createdAt: string;
}

export interface PackingPhoto {
    id: string;
    timestamp: string;
    photoUrl: string;
    packerName: string;
    stationId: string;
}

export interface PackingKpiStats {
    packerId: string;
    packerName: string;
    packagesCount: number;
    itemsCount: number;
    totalWeightKg: number;
    avgPackTimeSeconds: number;
}

export interface PickupSchedule {
    carrier: string;
    pickupTime: string; // e.g. "15:30"
    autoTriggerEnabled: boolean;
    lastPickupAt?: string;
}

export interface CustomerOrderLine {
    id: string;
    orderId: string;
    productId: string;
    variantId: string;
    sku: string;
    quantity: number;
    ownStockQuantity: number;
    createdAt: string;
    priority?: number;
    paymentInfo?: PaymentInfo;
}

export interface StoreStockAdjustmentPayload {
    sku: string;
    deltaQuantity: number;
    newStockLevel: number;
    reason: 'GOODS_RECEIVED' | 'ORDER_FULFILLED' | 'MANUAL_CORRECTION';
    syncedAt: string;
}

export interface SupplierOffer {
    supplierId: string;
    supplierSku: string;
    productId: string;
    variantId: string;
    availableQuantity: number;
    unitPrice: number;
    currency: string;
    leadTimeDays: number;
    active: boolean;
    supplierPriority?: number;
}

export interface PurchaseOrderLine {
    id: string;
    supplierId: string;
    customerOrderLineId: string;
    productId: string;
    variantId: string;
    sku: string;
    supplierSku: string;
    quantity: number;
    receivedQuantity: number;
    unitPrice: number;
    currency: string;
    expectedLeadTimeDays: number;
}

/** Alias for PurchaseOrderLine used at the selection stage. */
export type ProcurementLine = PurchaseOrderLine;

export interface UnfulfilledDemand {
    customerOrderLineId: string;
    productId: string;
    variantId: string;
    sku: string;
    quantity: number;
    reason: 'NO_SUPPLIER_OFFER' | 'INSUFFICIENT_SUPPLIER_STOCK' | 'AWAITING_PAYMENT';
}

export interface PurchaseOrder {
    id: string;
    supplierId: string;
    status: 'DRAFT' | 'PENDING_APPROVAL' | 'SENT' | 'CANCELLED' | 'COMPLETED' | 'RECEIVED' | 'PARTIALLY_RECEIVED';
    lines: PurchaseOrderLine[];
}

export interface ProcurementPlan {
    purchaseOrders: PurchaseOrder[];
    unfulfilled: UnfulfilledDemand[];
    /**
     * Units of OWN stock promised to each customer order line in this run (absolute, not a delta).
     * Every planned line is listed – 0 releases an earlier reservation (e.g. payment no longer cleared).
     */
    ownStockReservations?: OwnStockReservation[];
}

export interface OwnStockReservation {
    customerOrderLineId: string;
    quantity: number;
}

export interface Allocation {
    customerOrderLineId: string;
    allocatedQuantity: number;
    fulfilled: boolean;
}

export interface GoodsReceiptLine {
    purchaseOrderId: string;
    procurementLineId: string;
    receivedQuantity: number;
}

export interface ProcurementPolicy {
    approvalMode: 'automatic' | 'manual';
    /** Payment gate for purchasing, own-stock reservation and shipping. Defaults to DEFAULT_PAYMENT_GATE. */
    paymentGate?: PaymentGatePolicy;
    speedWeight?: number;
    supplierPriorityWeight?: number;
}

export interface SupplierStatusUpdate {
    /** Supplier-side order ID (as returned by dispatchPurchaseOrder). */
    externalId: string;
    /** Our purchase order ID, if the supplier integration knows it. Preferred over externalId lookup. */
    purchaseOrderId?: string;
    supplierId?: string;
    status: 'ACCEPTED' | 'SHIPPED' | 'CANCELLED';
}

/**
 * Which customer orders may be purchased for, reserve own stock and be released for picking/shipping.
 * Configurable per tenant (shop).
 */
export interface PaymentGatePolicy {
    /** false = do not check payment at all (explicit tenant opt-out, e.g. no-API mode without payment data). */
    enabled: boolean;
    /** Payment statuses that release the order. Missing paymentInfo never releases while enabled. */
    allowedStatuses: readonly PaymentStatus[];
}

/** Safe default: only paid orders and cash on delivery. Partially paid and unknown payment state are blocked. */
export const DEFAULT_PAYMENT_GATE: PaymentGatePolicy = Object.freeze({
    enabled: true,
    allowedStatuses: Object.freeze(['PAID', 'COD'] as const),
});
