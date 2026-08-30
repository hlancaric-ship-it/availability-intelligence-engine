import type { SupplierCatalogPort, SupplierDispatchPort } from '../../core/procurement/ports.js';
import type { PurchaseOrder, SupplierOffer, SupplierStatusUpdate } from '../../core/procurement/types.js';
import type { SupplierFeedClient } from './SupplierFeedAdapter.js';
import { SupplierFeedAdapter } from './SupplierFeedAdapter.js';

export class SupplierIntegrationRegistry implements SupplierCatalogPort, SupplierDispatchPort {
    private readonly adapters: Map<string, SupplierFeedAdapter> = new Map();

    public register(supplierId: string, client: SupplierFeedClient): void {
        this.adapters.set(supplierId, new SupplierFeedAdapter(client));
    }

    public async fetchOffers(): Promise<SupplierOffer[]> {
        const promises = Array.from(this.adapters.values()).map(adapter =>
            adapter.fetchOffers().catch(err => {
                console.error(`Failed to fetch offers for a supplier:`, err);
                return [] as SupplierOffer[];
            })
        );
        const results = await Promise.all(promises);
        return results.flat();
    }

    public async dispatchPurchaseOrder(order: PurchaseOrder): Promise<{ externalId: string }> {
        const adapter = this.adapters.get(order.supplierId);
        if (!adapter) {
            throw new Error(`Supplier integration not found for supplier ${order.supplierId}`);
        }
        return adapter.sendPurchaseOrder(order);
    }

    /** Generic registry has no status polling API; each supplier integration must implement this via dedicated adapters. */
    public async fetchStatusUpdates(): Promise<SupplierStatusUpdate[]> {
        return [];
    }
}
