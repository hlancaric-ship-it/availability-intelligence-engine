import type { Allocation, CustomerOrderLine, GoodsReceiptLine, ProcurementPlan, PurchaseOrder, SupplierOffer } from './types.js';

/** External effects intentionally live behind ports; the core never calls Shoptet or suppliers directly. */
export interface CommercePlatformPort {
    fetchUnfulfilledOrderLines(): Promise<CustomerOrderLine[]>;
}

/** Internal state only: never a call back to the commerce platform. */
export interface FulfillmentReadinessPort {
    markReadyToShip(allocations: Allocation[]): Promise<void>;
}

export interface SupplierCatalogPort {
    fetchOffers(): Promise<SupplierOffer[]>;
}

export interface PurchaseOrderPort {
    savePlan(tenantId: string, plan: ProcurementPlan): Promise<void>;
    markAsSent(orderId: string): Promise<void>;
    recordReceipt(receipt: GoodsReceiptLine[]): Promise<void>;
    getOrdersByIds(tenantId: string, orderIds: string[]): Promise<PurchaseOrder[]>;
}

export interface IdempotencyPort {
    claim(key: string, operation: string): Promise<boolean>;
    complete(key: string, operation: string): Promise<void>;
    fail(key: string, operation: string): Promise<void>;
}

export interface AuditPort {
    append(event: { tenantId: string; type: string; entityId: string; payload: unknown; occurredAt: string }): Promise<void>;
}
export interface SupplierDispatchPort { dispatchPurchaseOrder(order: PurchaseOrder): Promise<{ externalId: string }>; }

export interface LoggerPort {
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
}
