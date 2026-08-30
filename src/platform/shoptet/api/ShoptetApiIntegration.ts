import { AvailabilityEngine } from '../../../core/availability/AvailabilityEngine.js';
import { SortingPipeline } from '../../../core/ranking/SortingPipeline.js';
import { normalizeShoptetApiProduct } from '../normalizer/apiNormalizer.js';
import { TenantConfig } from '../../../tenants/configuration.js';

export class ShoptetApiIntegration {
    public async process(tenant: TenantConfig, rawApiProducts: any[]) {
        if (!tenant.enabled) return [];
        
        // 1. Normalize
        const coreInputs = rawApiProducts.map(normalizeShoptetApiProduct);
        
        // 2. Evaluate
        const evaluated = coreInputs.map(p => AvailabilityEngine.evaluate(p));
        
        // 3. Rank
        const ranked = SortingPipeline.sort(evaluated);
        
        // 4. Internal read model only. This is never written back to Shoptet.
        return ranked.map((res, index) => ({
            guid: res.productId,
            availabilityStatus: res.status,
            internalRank: index + 1,
        }));
    }
}
