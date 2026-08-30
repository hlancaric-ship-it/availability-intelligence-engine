import type { SupplierCatalogPort } from '../../core/procurement/ports.js';
import type { PurchaseOrder, SupplierOffer } from '../../core/procurement/types.js';

export interface SupplierFeedClient { fetchOffers(): Promise<unknown[]>; sendPurchaseOrder(order: PurchaseOrder): Promise<{ externalId: string }>; }

/** Validates supplier data at the boundary before it can influence purchasing. */
export class SupplierFeedAdapter implements SupplierCatalogPort {
    public constructor(private readonly client: SupplierFeedClient) {}
    public async fetchOffers(): Promise<SupplierOffer[]> {
        return (await this.client.fetchOffers()).map((row) => this.normalize(row));
    }
    public async sendPurchaseOrder(order: PurchaseOrder): Promise<{ externalId: string }> { return this.client.sendPurchaseOrder(order); }
    private normalize(row: unknown): SupplierOffer {
        if (!row || typeof row !== 'object') throw new Error('Invalid supplier offer');
        const value = row as Record<string, unknown>;
        const required = ['supplierId', 'supplierSku', 'productId', 'variantId', 'currency'];
        if (required.some((key) => typeof value[key] !== 'string' || value[key] === '')) throw new Error('Supplier offer misses identity fields');
        const availableQuantity = Number(value.availableQuantity); const unitPrice = Number(value.unitPrice); const leadTimeDays = Number(value.leadTimeDays);
        if (![availableQuantity, unitPrice, leadTimeDays].every(Number.isFinite) || availableQuantity < 0 || unitPrice < 0 || leadTimeDays < 0) throw new Error('Supplier offer has invalid numeric fields');
        return { supplierId: value.supplierId as string, supplierSku: value.supplierSku as string, productId: value.productId as string, variantId: value.variantId as string, currency: value.currency as string, availableQuantity, unitPrice, leadTimeDays, active: value.active !== false, ...(typeof value.supplierPriority === 'number' ? { supplierPriority: value.supplierPriority } : {}) };
    }
}
