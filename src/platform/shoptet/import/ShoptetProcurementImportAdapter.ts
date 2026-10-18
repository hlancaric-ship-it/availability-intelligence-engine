import type { CustomerOrderLine } from '../../../core/procurement/types.js';
import type { CommercePlatformPort } from '../../../core/procurement/ports.js';

/**
 * No-API path: a scheduled import parses the platform export into canonical demand,
 * and the returned rows can be emitted as a platform import file by the deployment layer.
 */
export class ShoptetProcurementImportAdapter implements CommercePlatformPort {
    public constructor(private readonly rows: Array<{ itemId: string; orderCode: string; productGuid: string; variantGuid: string; code: string; quantity: string; stockQuantity: string; createdAt: string }>) {}

    public async fetchUnfulfilledOrderLines(): Promise<CustomerOrderLine[]> {
        return this.rows.map((row, index) => {
            const quantity = String(row.quantity ?? '').trim() === '' ? NaN : Number(row.quantity);
            const ownStockQuantity = String(row.stockQuantity ?? '').trim() === '' ? NaN : Number(row.stockQuantity);
            if (!row.itemId || !row.productGuid || !row.variantGuid) throw new Error(`Import row ${index + 1}: missing item/product/variant identifier`);
            if (!Number.isInteger(quantity) || quantity < 0) throw new Error(`Import row ${index + 1}: invalid quantity`);
            if (!Number.isInteger(ownStockQuantity) || ownStockQuantity < 0) throw new Error(`Import row ${index + 1}: invalid stockQuantity`);
            return {
                id: row.itemId, orderId: row.orderCode, productId: row.productGuid, variantId: row.variantGuid,
                sku: row.code, quantity, ownStockQuantity, createdAt: row.createdAt,
            };
        });
    }

}
