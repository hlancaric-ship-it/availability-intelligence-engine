import type { CustomerOrderLine } from '../../../core/procurement/types.js';
import type { CommercePlatformPort } from '../../../core/procurement/ports.js';

/** Strict read-only boundary: this interface deliberately has no mutation operation. */
export interface ShoptetReadonlyGateway {
    listOpenOrderItems(): Promise<Array<{ itemId: string; orderCode: string; productGuid: string; variantGuid: string; code: string; quantity: number; stockQuantity: number; createdAt: string }>>;
}

/** API mode adapter. A no-API import adapter should implement the same CommercePlatformPort. */
export class ShoptetProcurementAdapter implements CommercePlatformPort {
    public constructor(private readonly gateway: ShoptetReadonlyGateway) {}

    public async fetchUnfulfilledOrderLines(): Promise<CustomerOrderLine[]> {
        const items = await this.gateway.listOpenOrderItems();
        return items.map((item) => ({
            id: item.itemId, orderId: item.orderCode, productId: item.productGuid, variantId: item.variantGuid,
            sku: item.code, quantity: item.quantity, ownStockQuantity: item.stockQuantity, createdAt: item.createdAt,
        }));
    }

}
