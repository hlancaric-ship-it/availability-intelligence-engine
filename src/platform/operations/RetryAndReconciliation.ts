import type { AuditPort, LoggerPort } from '../../core/procurement/ports.js';

export interface RetryPolicy { attempts: number; baseDelayMs: number; }
export class RetryExecutor {
    public constructor(private readonly sleep: (ms: number) => Promise<void>, private readonly logger: LoggerPort) {}
    public async run<T>(tenantId: string, operationName: string, operation: () => Promise<T>, policy: RetryPolicy): Promise<T> {
        let lastError: unknown;
        for (let attempt = 0; attempt < policy.attempts; attempt++) {
            try { 
                return await operation(); 
            } catch (error) { 
                lastError = error; 
                const safeError = error instanceof Error ? error.message : 'Unknown error';
                this.logger.warn(`Operation failed, scheduling retry`, { tenantId, operation: operationName, attempt: attempt + 1, error: safeError });
                if (attempt + 1 < policy.attempts) await this.sleep(policy.baseDelayMs * 2 ** attempt); 
            }
        }
        const safeError = lastError instanceof Error ? lastError.message : 'Unknown error';
        this.logger.error(`Operation failed permanently after retries`, { tenantId, operation: operationName, attempts: policy.attempts, error: safeError });
        throw lastError;
    }
}

export interface ReconciliationSource { 
    listOpenPurchaseOrderIds(): Promise<string[]>; 
    listActiveRequirementIds(): Promise<string[]>;
}
export interface ReconciliationStore { 
    listOpenPurchaseOrderIds(): Promise<string[]>; 
    listActiveRequirementIds(): Promise<string[]>;
    listActiveAllocationIds(): Promise<string[]>;
    recordMismatch(entityType: 'PO' | 'REQUIREMENT' | 'ALLOCATION', missingIn: 'SOURCE' | 'STORE', id: string): Promise<void>; 
}
export async function reconcile(tenantId: string, source: ReconciliationSource, store: ReconciliationStore, audit: AuditPort, logger: LoggerPort): Promise<void> {
    logger.info('Starting reconciliation', { tenantId });
    const reconcileEntity = async (type: 'PO' | 'REQUIREMENT', sourceList: Promise<string[]>, storeList: Promise<string[]>) => {
        const [sourceIds, storeIds] = await Promise.all([sourceList, storeList]);
        const sourceSet = new Set(sourceIds); const storeSet = new Set(storeIds);
        
        for (const id of sourceSet) {
            if (!storeSet.has(id)) {
                logger.warn('Reconciliation mismatch', { tenantId, type, missingIn: 'STORE', entityId: id });
                await audit.append({ tenantId, type: 'RECONCILIATION_MISMATCH', entityId: id, payload: { entityType: type, missingIn: 'STORE' }, occurredAt: new Date().toISOString() });
                await store.recordMismatch(type, 'STORE', id);
            }
        }
        for (const id of storeSet) {
            if (!sourceSet.has(id)) {
                logger.warn('Reconciliation mismatch', { tenantId, type, missingIn: 'SOURCE', entityId: id });
                await audit.append({ tenantId, type: 'RECONCILIATION_MISMATCH', entityId: id, payload: { entityType: type, missingIn: 'SOURCE' }, occurredAt: new Date().toISOString() });
                await store.recordMismatch(type, 'SOURCE', id);
            }
        }
    };

    await Promise.all([
        reconcileEntity('PO', source.listOpenPurchaseOrderIds(), store.listOpenPurchaseOrderIds()),
        reconcileEntity('REQUIREMENT', source.listActiveRequirementIds(), store.listActiveRequirementIds())
    ]);

    const [sourceReqs, storeAllocations] = await Promise.all([source.listActiveRequirementIds(), store.listActiveAllocationIds()]);
    const sourceReqSet = new Set(sourceReqs);
    for (const reqId of storeAllocations) {
        if (!sourceReqSet.has(reqId)) {
            logger.warn('Reconciliation mismatch', { tenantId, type: 'ALLOCATION', missingIn: 'SOURCE', entityId: reqId });
            await audit.append({ tenantId, type: 'RECONCILIATION_MISMATCH', entityId: reqId, payload: { entityType: 'ALLOCATION', missingIn: 'SOURCE' }, occurredAt: new Date().toISOString() });
            await store.recordMismatch('ALLOCATION', 'SOURCE', reqId);
        }
    }
    logger.info('Reconciliation completed', { tenantId });
}
