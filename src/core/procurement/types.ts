/** Canonical data model. Platform and supplier adapters map their payloads here. */
export type ApprovalMode = 'manual' | 'automatic';
export type PurchaseOrderStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED';

export interface CustomerOrderLine {
    id: string;
    orderId: string;
    productId: string;
    variantId: string;
    sku: string;
    quantity: number;
    ownStockQuantity: number;
    priority?: number;
    createdAt: string;
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
    supplierPriority?: number | undefined;
}

export interface ProcurementPolicy {
    approvalMode: ApprovalMode;
    /** Larger values make delivery speed more important than price. */
    speedWeight?: number;
    /** Kept configurable because tenants can prefer a contracted supplier on ties. */
    supplierPriorityWeight?: number;
}

export interface ProcurementLine {
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

export interface PurchaseOrder {
    id: string;
    supplierId: string;
    status: PurchaseOrderStatus;
    lines: ProcurementLine[];
}

export interface UnfulfilledDemand {
    customerOrderLineId: string;
    productId: string;
    variantId: string;
    sku: string;
    quantity: number;
    reason: 'NO_SUPPLIER_OFFER' | 'INSUFFICIENT_SUPPLIER_STOCK';
}

export interface ProcurementPlan {
    purchaseOrders: PurchaseOrder[];
    unfulfilled: UnfulfilledDemand[];
}

export interface GoodsReceiptLine {
    purchaseOrderId: string;
    procurementLineId: string;
    receivedQuantity: number;
}

export interface Allocation {
    customerOrderLineId: string;
    allocatedQuantity: number;
    fulfilled: boolean;
}
