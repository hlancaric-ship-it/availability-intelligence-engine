import { ProductAvailabilityInput, VariantAvailability } from '../../../core/availability/types.js';

/**
 * Normalizes Shoptet CSV/XML export row to core ProductAvailabilityInput
 */
export function normalizeShoptetExportProduct(exportProduct: any): ProductAvailabilityInput {
    // Simulated mapping from an Export (like CSV/XML) product structure
    return {
        id: exportProduct.ProductGuid,
        sku: exportProduct.Code,
        baseSortPriority: Number(exportProduct.TopRank || 0),
        relevanceScore: 0,
        variants: (exportProduct.ParsedVariants || []).map((v: any): VariantAvailability => ({
            id: v.VariantGuid,
            isPurchasable: v.Purchasable === '1',
            inStock: Number(v.Stock) > 0,
            stockAmount: Number(v.Stock),
            onOrder: v.OnOrder === '1',
            inTransit: v.InTransit === '1'
        }))
    };
}
