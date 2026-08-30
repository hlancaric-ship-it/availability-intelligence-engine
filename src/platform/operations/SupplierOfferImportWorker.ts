import type { LoggerPort, AuditPort } from '../../core/procurement/ports.js';
import type { NoApiCsvAdapter } from '../suppliers/NoApiCsvAdapter.js';
import type { BlobStoragePort } from './NoApiRunner.js';
import type { RetryExecutor } from './RetryAndReconciliation.js';
import type { TransactionalSql } from '../persistence/PostgresProcurementRepository.js';
import type { SupplierOffer } from '../../core/procurement/types.js';

export interface SupplierOfferRepositoryPort {
    saveOffers(tenantId: string, offers: SupplierOffer[]): Promise<void>;
}

export class PostgresSupplierOfferRepository implements SupplierOfferRepositoryPort {
    public constructor(private readonly db: TransactionalSql) {}

    public async saveOffers(tenantId: string, offers: SupplierOffer[]): Promise<void> {
        if (offers.length === 0) return;
        await this.db.transaction(async (tx) => {
            for (const offer of offers) {
                await tx.query(
                    `INSERT INTO procurement_supplier_offers (
                        tenant_id, supplier_id, supplier_sku, product_id, variant_id,
                        available_quantity, unit_price, currency, lead_time_days, active
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (tenant_id, supplier_id, supplier_sku, variant_id)
                    DO UPDATE SET
                        product_id = EXCLUDED.product_id,
                        available_quantity = EXCLUDED.available_quantity,
                        unit_price = EXCLUDED.unit_price,
                        currency = EXCLUDED.currency,
                        lead_time_days = EXCLUDED.lead_time_days,
                        active = EXCLUDED.active`,
                    [
                        tenantId,
                        offer.supplierId,
                        offer.supplierSku,
                        offer.productId,
                        offer.variantId,
                        offer.availableQuantity,
                        offer.unitPrice,
                        offer.currency,
                        offer.leadTimeDays,
                        offer.active,
                    ],
                );
            }
        });
    }
}

export class SupplierOfferImportWorker {
    public constructor(
        private readonly blobStorage: BlobStoragePort,
        private readonly adapter: NoApiCsvAdapter,
        private readonly offerRepo: SupplierOfferRepositoryPort,
        private readonly retryExecutor: RetryExecutor,
        private readonly logger: LoggerPort,
        private readonly audit: AuditPort,
    ) {}

    public async importOffersForSupplier(tenantId: string, supplierId: string, eventId: string): Promise<number> {
        this.logger.info('Starting supplier offer feed import', { tenantId, supplierId, eventId });
        try {
            return await this.retryExecutor.run(
                tenantId,
                `IMPORT_OFFERS_${supplierId}_${eventId}`,
                async () => {
                    const latestFileId = await this.blobStorage.getLatestOfferFile(supplierId);
                    if (!latestFileId) {
                        this.logger.info('No offer file found for supplier', { tenantId, supplierId });
                        return 0;
                    }

                    const csvContent = await this.blobStorage.readOfferFile(latestFileId);
                    const offers = this.adapter.importSupplierOffers(supplierId, csvContent);

                    if (offers.length > 0) {
                        await this.offerRepo.saveOffers(tenantId, offers);
                    }

                    this.logger.info('Supplier offers imported successfully', {
                        tenantId,
                        supplierId,
                        fileId: latestFileId,
                        offersCount: offers.length,
                    });

                    await this.audit.append({
                        tenantId,
                        type: 'SUPPLIER_OFFERS_IMPORTED',
                        entityId: supplierId,
                        payload: { fileId: latestFileId, count: offers.length },
                        occurredAt: new Date().toISOString(),
                    });

                    return offers.length;
                },
                { attempts: 3, baseDelayMs: 1000 },
            );
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Supplier offer feed import failed', { tenantId, supplierId, error: safeError });
            await this.audit.append({
                tenantId,
                type: 'SUPPLIER_OFFERS_IMPORT_FAILED',
                entityId: supplierId,
                payload: { error: safeError },
                occurredAt: new Date().toISOString(),
            });
            throw error;
        }
    }
}
