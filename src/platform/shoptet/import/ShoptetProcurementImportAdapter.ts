import type { CustomerOrderLine } from '../../../core/procurement/types.js';
import type { CommercePlatformPort } from '../../../core/procurement/ports.js';

/**
 * No-API path: a scheduled import parses the platform export into canonical demand,
 * and the returned rows can be emitted as a platform import file by the deployment layer.
 */
export class ShoptetProcurementImportAdapter implements CommercePlatformPort {
    public constructor(private readonly rows: Array<{ itemId: string; orderCode: string; productGuid: string; variantGuid: string; code: string; quantity: string; stockQuantity: string; createdAt: string }>) {}

    public async fetchUnfulfilledOrderLines(): Promise<CustomerOrderLine[]> {
        return this.rows.map((row) => ({
            id: row.itemId, orderId: row.orderCode, productId: row.productGuid, variantId: row.variantGuid,
            sku: row.code, quantity: Number(row.quantity), ownStockQuantity: Number(row.stockQuantity), createdAt: row.createdAt,
        }));
    }

}
