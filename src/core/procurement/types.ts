export interface GoodsReceiptLine {
    purchaseOrderId: string;
    procurementLineId: string;
    receivedQuantity: number;
}

export interface ProcurementPolicy {
    approvalMode: 'automatic' | 'manual';
}

export interface PurchaseOrder {
    id: string;
    supplierId: string;
    status: 'DRAFT' | 'SENT' | 'CANCELLED' | 'COMPLETED';
    lines: PurchaseOrderLine[];
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

export interface SupplierStatusUpdate {
    externalId: string;
    status: 'ACCEPTED' | 'SHIPPED' | 'CANCELLED';
}
