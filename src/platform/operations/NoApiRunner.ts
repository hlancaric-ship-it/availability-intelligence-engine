import { RetryExecutor } from './RetryAndReconciliation.js';
import type { LoggerPort, AuditPort } from '../../core/procurement/ports.js';
import type { ProcurementWorkflow } from '../../core/procurement/Workflow.js';
import type { ProcurementPolicy } from '../../core/procurement/types.js';
import { NoApiCsvAdapter } from '../suppliers/NoApiCsvAdapter.js';

export interface BlobStoragePort {
    getLatestOfferFile(supplierId: string): Promise<string | undefined>;
    readOfferFile(fileId: string): Promise<string>;

    listPendingReceiptFiles(supplierId: string): Promise<string[]>;
    readReceiptFile(fileId: string): Promise<string>;
    archiveReceiptFile(fileId: string): Promise<void>;

    writePurchaseOrderExport(supplierId: string, externalId: string, csvContent: string): Promise<void>;
}

export class NoApiRunner {
    public constructor(
        private readonly workflow: ProcurementWorkflow,
        private readonly blobStorage: BlobStoragePort,
        private readonly adapter: NoApiCsvAdapter,
        private readonly logger: LoggerPort,
        private readonly audit: AuditPort,
        private readonly retryExecutor: RetryExecutor
    ) {}

    /**
     * Cron-triggered job to process any pending CSV receipts for a NO-API supplier.
     */
    public async processPendingReceipts(tenantId: string, supplierId: string): Promise<void> {
        this.logger.info('Starting NO-API receipt runner', { tenantId, supplierId });
        try {
            const pendingFiles = await this.blobStorage.listPendingReceiptFiles(supplierId);
            for (const fileId of pendingFiles) {
                await this.retryExecutor.run(tenantId, `PROCESS_RECEIPT_FILE_${fileId}`, async () => {
                    const content = await this.blobStorage.readReceiptFile(fileId);
                    const receipts = this.adapter.importGoodsReceipt(content);
                    if (receipts.length > 0) {
                        await this.workflow.receive(tenantId, `receipt-${fileId}`, receipts);
                    }
                    await this.blobStorage.archiveReceiptFile(fileId);
                }, { attempts: 3, baseDelayMs: 1000 });
            }
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('NO-API receipt runner failed', { tenantId, supplierId, error: safeError });
            await this.audit.append({ tenantId, type: 'NO_API_RUNNER_FAILED', entityId: supplierId, payload: { error: safeError }, occurredAt: new Date().toISOString() });
        }
    }

    /**
     * Cron-triggered job to run a full procurement planning cycle.
     * Idempotency is enforced by the workflow using the eventId.
     */
    public async runProcurementCycle(tenantId: string, policy: ProcurementPolicy, eventId: string): Promise<void> {
        this.logger.info('Starting scheduled procurement cycle', { tenantId, eventId });
        try {
            await this.retryExecutor.run(tenantId, `PROCUREMENT_CYCLE_${eventId}`, async () => {
                await this.workflow.createPlan(tenantId, eventId, policy);
            }, { attempts: 3, baseDelayMs: 2000 });
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Procurement cycle failed permanently', { tenantId, eventId, error: safeError });
            await this.audit.append({ tenantId, type: 'PROCUREMENT_CYCLE_FAILED', entityId: eventId, payload: { error: safeError }, occurredAt: new Date().toISOString() });
        }
    }

    /**
     * Cron-triggered job to pull supplier order status updates.
     */
    public async syncSupplierStatus(tenantId: string, eventId: string): Promise<void> {
        this.logger.info('Starting supplier status sync', { tenantId, eventId });
        try {
            await this.retryExecutor.run(tenantId, `SYNC_STATUS_${eventId}`, async () => {
                await this.workflow.syncSupplierStatus(tenantId, eventId);
            }, { attempts: 3, baseDelayMs: 1000 });
        } catch (error) {
            const safeError = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Supplier status sync failed permanently', { tenantId, eventId, error: safeError });
            await this.audit.append({ tenantId, type: 'SUPPLIER_STATUS_SYNC_FAILED', entityId: eventId, payload: { error: safeError }, occurredAt: new Date().toISOString() });
        }
    }
}
