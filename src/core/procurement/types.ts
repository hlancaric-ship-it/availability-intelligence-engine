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
    reason: 'NO_SUPPLIER_OFFER' | 'INSUFFICIENT_SUPPLIER_STOCK';
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
    speedWeight?: number;
    supplierPriorityWeight?: number;
}

export interface SupplierStatusUpdate {
    externalId: string;
    status: 'ACCEPTED' | 'SHIPPED' | 'CANCELLED';
}
