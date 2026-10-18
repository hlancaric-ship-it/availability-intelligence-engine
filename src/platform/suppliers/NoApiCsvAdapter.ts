/** Neutralises CSV/formula injection (=,+,-,@,tab,CR) and quotes cells containing separators. */
export function csvCell(value: string): string {
    let v = String(value);
    if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
    if (/[",\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
    return v;
}

import type { PurchaseOrder, SupplierOffer, GoodsReceiptLine } from '../../core/procurement/types.js';

/**
 * Resolves the "NO-API procurement workflow" blocker.
 * Instead of manual copy-pasting SKU/quantity into a supplier's portal,
 * this adapter generates automated CSV exports and parses CSV imports.
 */
export class NoApiCsvAdapter {
    /**
     * Generates a CSV for a PurchaseOrder to be uploaded to the supplier's B2B portal.
     * Keeps the format simple: supplierSku, quantity
     */
    public exportPurchaseOrder(order: PurchaseOrder): string {
        const header = 'supplierSku,quantity';
        const rows = order.lines.map((line) => `${csvCell(line.supplierSku)},${line.quantity}`);
        return [header, ...rows].join('\n');
    }

    /**
     * Parses a generic CSV feed of supplier offers.
     * Expected format: supplierSku,productId,variantId,availableQuantity,unitPrice,currency,leadTimeDays
     */
    public importSupplierOffers(supplierId: string, csvContent: string): SupplierOffer[] {
        const lines = csvContent.trim().split('\n');
        if (lines.length < 2) return [];

        return lines.slice(1).map((line) => {
            const [supplierSku, productId, variantId, availableQuantity, unitPrice, currency, leadTimeDays] = line.split(',');
            if (!supplierSku || !productId || !variantId || !currency) {
                throw new Error('Invalid CSV format: Missing required string fields');
            }
            const qty = Number(availableQuantity), price = Number(unitPrice), lead = Number(leadTimeDays);
            if (!Number.isInteger(qty) || qty < 0) throw new Error('Invalid CSV: availableQuantity must be a non-negative integer');
            if (!Number.isFinite(price) || price < 0) throw new Error('Invalid CSV: unitPrice must be a non-negative number');
            if (!Number.isInteger(lead) || lead < 0) throw new Error('Invalid CSV: leadTimeDays must be a non-negative integer');
            return {
                supplierId,
                supplierSku: supplierSku.trim(),
                productId: productId.trim(),
                variantId: variantId.trim(),
                availableQuantity: qty,
                unitPrice: price,
                currency: currency.trim(),
                leadTimeDays: lead,
                active: true
            };
        });
    }

    /**
     * Parses a generic CSV receipt from a supplier.
     * Expected format: purchaseOrderId,procurementLineId,receivedQuantity
     */
    public importGoodsReceipt(csvContent: string): GoodsReceiptLine[] {
        const lines = csvContent.trim().split('\n');
        if (lines.length < 2) return [];

        return lines.slice(1).map((line) => {
            const [purchaseOrderId, procurementLineId, receivedQuantity] = line.split(',');
            if (!purchaseOrderId || !procurementLineId) {
                throw new Error('Invalid CSV format: Missing required fields in goods receipt');
            }
            const qty = Number(receivedQuantity);
            if (!Number.isInteger(qty) || qty <= 0) throw new Error('Invalid CSV: receivedQuantity must be a positive integer');
            return {
                purchaseOrderId: purchaseOrderId.trim(),
                procurementLineId: procurementLineId.trim(),
                receivedQuantity: qty
            };
        });
    }
}

import type { SupplierFeedClient } from './SupplierFeedAdapter.js';
import type { BlobStoragePort } from '../operations/NoApiRunner.js';

export class NoApiCsvSupplierClient implements SupplierFeedClient {
    public constructor(
        private readonly supplierId: string,
        private readonly blobStorage: BlobStoragePort,
        private readonly adapter: NoApiCsvAdapter
    ) {}

    public async fetchOffers(): Promise<unknown[]> {
        const fileId = await this.blobStorage.getLatestOfferFile(this.supplierId);
        if (!fileId) return [];
        const content = await this.blobStorage.readOfferFile(fileId);
        return this.adapter.importSupplierOffers(this.supplierId, content);
    }

    public async sendPurchaseOrder(order: PurchaseOrder): Promise<{ externalId: string }> {
        const csvContent = this.adapter.exportPurchaseOrder(order);
        const externalId = `export-${order.id}-${Date.now()}.csv`;
        await this.blobStorage.writePurchaseOrderExport(this.supplierId, externalId, csvContent);
        return { externalId };
    }
}
