import { ProductAvailabilityInput, VariantAvailability } from '../../../core/availability/types.js';

/**
 * Normalizes Shoptet API payload to core ProductAvailabilityInput
 */
export function normalizeShoptetApiProduct(apiProduct: any): ProductAvailabilityInput {
    // Simulated mapping from an API product structure
    return {
        id: apiProduct.guid,
        sku: apiProduct.code,
        baseSortPriority: apiProduct.bestsellerRank || 0,
        relevanceScore: 0,
        variants: (apiProduct.variants || []).map((v: any): VariantAvailability => ({
            id: v.guid,
            isPurchasable: v.purchasable !== false,
            inStock: v.stock > 0,
            stockAmount: v.stock,
            onOrder: v.canPreorder === true,
            inTransit: v.inTransit === true
        }))
    };
}
