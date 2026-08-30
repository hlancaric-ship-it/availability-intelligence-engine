import { describe, test, expect, vi } from 'vitest';
import { SupplierOfferImportWorker, PostgresSupplierOfferRepository } from '../src/platform/operations/SupplierOfferImportWorker.js';
import type { SupplierOfferRepositoryPort } from '../src/platform/operations/SupplierOfferImportWorker.js';
import type { BlobStoragePort } from '../src/platform/operations/NoApiRunner.js';
import { NoApiCsvAdapter } from '../src/platform/suppliers/NoApiCsvAdapter.js';
import { RetryExecutor } from '../src/platform/operations/RetryAndReconciliation.js';
import type { LoggerPort, AuditPort } from '../src/core/procurement/ports.js';
import type { SqlTransaction, SqlQueryResult } from '../src/platform/persistence/PostgresProcurementRepository.js';

describe('Phase 6 - PostgresSupplierOfferRepository', () => {
    test('executes upsert query for supplier offers', async () => {
        const queryCalls: { sql: string; values?: unknown[] }[] = [];
        const tx: SqlTransaction = {
            query: vi.fn().mockImplementation(async (sql: string, values?: unknown[]) => {
                queryCalls.push({ sql, values });
                return { rowCount: 1 } as SqlQueryResult<unknown>;
            }),
        };
        const db = {
            transaction: vi.fn().mockImplementation(async (work: (t: SqlTransaction) => Promise<unknown>) => work(tx)),
        };

        const repo = new PostgresSupplierOfferRepository(db);
        await repo.saveOffers('tenant-test', [
            {
                supplierId: 'sup-1',
                supplierSku: 'sku-1',
                productId: 'p-1',
                variantId: 'v-1',
                availableQuantity: 15,
                unitPrice: 120,
                currency: 'CZK',
                leadTimeDays: 2,
                active: true,
            },
        ]);

        expect(db.transaction).toHaveBeenCalledTimes(1);
        expect(queryCalls).toHaveLength(1);
        expect(queryCalls[0]!.sql).toContain('INSERT INTO procurement_supplier_offers');
        expect(queryCalls[0]!.values).toEqual([
            'tenant-test',
            'sup-1',
            'sku-1',
            'p-1',
            'v-1',
            15,
            120,
            'CZK',
            2,
            true,
        ]);
    });
});

describe('Phase 6 - SupplierOfferImportWorker', () => {
    const makeLogger = (): LoggerPort => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
    const makeAudit = (): AuditPort => ({ append: vi.fn().mockResolvedValue(undefined) });

    test('downloads latest offer file, parses CSV, saves to repo and logs audit event', async () => {
        const csv = `supplierSku,productId,variantId,availableQuantity,unitPrice,currency,leadTimeDays
SKU-A,PROD-1,VAR-1,10,250.00,CZK,3
SKU-B,PROD-2,VAR-2,20,500.00,CZK,1`;

        const blobStorage: BlobStoragePort = {
            getLatestOfferFile: vi.fn().mockResolvedValue('file-latest-123.csv'),
            readOfferFile: vi.fn().mockResolvedValue(csv),
            listPendingReceiptFiles: vi.fn(),
            readReceiptFile: vi.fn(),
            archiveReceiptFile: vi.fn(),
            writePurchaseOrderExport: vi.fn(),
        };

        const offerRepo: SupplierOfferRepositoryPort = {
            saveOffers: vi.fn().mockResolvedValue(undefined),
        };

        const adapter = new NoApiCsvAdapter();
        const sleep = vi.fn().mockResolvedValue(undefined);
        const logger = makeLogger();
        const audit = makeAudit();
        const retryExecutor = new RetryExecutor(sleep, logger);

        const worker = new SupplierOfferImportWorker(
            blobStorage,
            adapter,
            offerRepo,
            retryExecutor,
            logger,
            audit,
        );

        const count = await worker.importOffersForSupplier('tenant-1', 'sup-1', 'evt-import-1');

        expect(count).toBe(2);
        expect(blobStorage.getLatestOfferFile).toHaveBeenCalledWith('sup-1');
        expect(blobStorage.readOfferFile).toHaveBeenCalledWith('file-latest-123.csv');
        expect(offerRepo.saveOffers).toHaveBeenCalledTimes(1);
        expect(offerRepo.saveOffers).toHaveBeenCalledWith(
            'tenant-1',
            expect.arrayContaining([
                expect.objectContaining({ supplierSku: 'SKU-A', availableQuantity: 10 }),
                expect.objectContaining({ supplierSku: 'SKU-B', availableQuantity: 20 }),
            ]),
        );
        expect(audit.append).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                type: 'SUPPLIER_OFFERS_IMPORTED',
                entityId: 'sup-1',
                payload: { fileId: 'file-latest-123.csv', count: 2 },
            }),
        );
    });

    test('returns 0 when no file found in blob storage', async () => {
        const blobStorage: BlobStoragePort = {
            getLatestOfferFile: vi.fn().mockResolvedValue(undefined),
            readOfferFile: vi.fn(),
            listPendingReceiptFiles: vi.fn(),
            readReceiptFile: vi.fn(),
            archiveReceiptFile: vi.fn(),
            writePurchaseOrderExport: vi.fn(),
        };
        const offerRepo: SupplierOfferRepositoryPort = { saveOffers: vi.fn() };
        const adapter = new NoApiCsvAdapter();
        const logger = makeLogger();
        const audit = makeAudit();
        const retryExecutor = new RetryExecutor(vi.fn(), logger);

        const worker = new SupplierOfferImportWorker(
            blobStorage,
            adapter,
            offerRepo,
            retryExecutor,
            logger,
            audit,
        );

        const count = await worker.importOffersForSupplier('tenant-1', 'sup-2', 'evt-none');
        expect(count).toBe(0);
        expect(offerRepo.saveOffers).not.toHaveBeenCalled();
    });
});
