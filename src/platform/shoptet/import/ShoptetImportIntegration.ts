import { AvailabilityEngine } from '../../../core/availability/AvailabilityEngine.js';
import { SortingPipeline } from '../../../core/ranking/SortingPipeline.js';
import { normalizeShoptetExportProduct } from '../normalizer/exportNormalizer.js';
import { TenantConfig } from '../../../tenants/configuration.js';

export class ShoptetImportIntegration {
    public async process(tenant: TenantConfig, rawExportProducts: any[]) {
        if (!tenant.enabled) return [];
        
        // 1. Normalize
        const coreInputs = rawExportProducts.map(normalizeShoptetExportProduct);
        
        // 2. Evaluate
        const evaluated = coreInputs.map(p => AvailabilityEngine.evaluate(p));
        
        // 3. Rank
        const ranked = SortingPipeline.sort(evaluated);
        
        // 4. Internal read model only. An export is an input, never a return channel.
        return ranked.map((res, index) => ({
            guid: res.productId,
            availabilityStatus: res.status,
            internalRank: index + 1,
        }));
    }
}
