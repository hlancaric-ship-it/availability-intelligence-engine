import type { PurchaseOrder } from '../../core/procurement/types.js';
import type { SupplierFeedClient } from './SupplierFeedAdapter.js';

/**
 * BLOCKED: Neexistuje skutečná specifikace pro externí API/feed kontrakty.
 * Tento klient slouží jako zástupný model pro konkrétní dodavatelskou integraci,
 * dokud nebude poskytnut reálný kontrakt dodavatele.
 * 
 * Podporuje načítání nabídek (s variantami, cenou, skladem a ETA) a generování/odesílání PO.
 */
export class GenericSupplierClient implements SupplierFeedClient {
    public constructor(private readonly supplierId: string, private readonly endpointUrl: string) {}

    public async fetchOffers(): Promise<unknown[]> {
        // BLOCKED: Implementace stahování a parsování reálného XML/JSON feedu chybí.
        // Níže je pouze očekávaný mapovaný formát (jak jej validuje SupplierFeedAdapter):
        // {
        //     supplierId: string,
        //     supplierSku: string,
        //     productId: string,
        //     variantId: string,
        //     currency: string,
        //     availableQuantity: number,
        //     unitPrice: number,
        //     leadTimeDays: number,
        //     active: boolean,
        //     supplierPriority?: number
        // }
        throw new Error(`BLOCKED: Missing real feed specification for supplier ${this.supplierId}.`);
    }

    public async sendPurchaseOrder(order: PurchaseOrder): Promise<{ externalId: string }> {
        // BLOCKED: Implementace odesílání nákupní objednávky (PO) do systému dodavatele (API / e-mail) chybí.
        throw new Error(`BLOCKED: Missing real purchase order API specification for supplier ${this.supplierId}.`);
    }
}
