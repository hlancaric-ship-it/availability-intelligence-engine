import { describe, test, expect, vi } from 'vitest';
import { RetryExecutor, reconcile } from '../src/platform/operations/RetryAndReconciliation.js';
import type { ReconciliationSource, ReconciliationStore } from '../src/platform/operations/RetryAndReconciliation.js';
import type { AuditPort, LoggerPort } from '../src/core/procurement/ports.js';

describe('RetryExecutor', () => {
    const makeSleep = () => vi.fn().mockResolvedValue(undefined);
    const makeLogger = (): LoggerPort => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    });

    test('success on first attempt without retry or sleep', async () => {
        const sleep = makeSleep();
        const logger = makeLogger();
        const executor = new RetryExecutor(sleep, logger);
        const op = vi.fn().mockResolvedValue('success');

        const result = await executor.run('tenant-1', 'OP_1', op, { attempts: 3, baseDelayMs: 100 });

        expect(result).toBe('success');
        expect(op).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });

    test('retry then succeed with exponential backoff delay values', async () => {
        const sleep = makeSleep();
        const logger = makeLogger();
        const executor = new RetryExecutor(sleep, logger);
        let count = 0;
        const op = vi.fn().mockImplementation(async () => {
            count++;
            if (count < 3) {
                throw new Error(`Transient error ${count}`);
            }
            return 'recovered';
        });

        const result = await executor.run('tenant-1', 'OP_RETRY', op, { attempts: 4, baseDelayMs: 50 });

        expect(result).toBe('recovered');
        expect(op).toHaveBeenCalledTimes(3);
        expect(sleep).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenNthCalledWith(1, 50);  // 50 * 2^0
        expect(sleep).toHaveBeenNthCalledWith(2, 100); // 50 * 2^1
        expect(logger.warn).toHaveBeenCalledTimes(2);
        expect(logger.error).not.toHaveBeenCalled();
    });

    test('permanent failure after exhausting all attempts with no sleep after last attempt', async () => {
        const sleep = makeSleep();
        const logger = makeLogger();
        const executor = new RetryExecutor(sleep, logger);
        const permanentError = new Error('Database down');
        const op = vi.fn().mockRejectedValue(permanentError);

        await expect(
            executor.run('tenant-1', 'OP_FAIL', op, { attempts: 3, baseDelayMs: 200 }),
        ).rejects.toThrow('Database down');

        expect(op).toHaveBeenCalledTimes(3);
        expect(sleep).toHaveBeenCalledTimes(2); // slept after attempt 1 and 2, but NOT after attempt 3
        expect(sleep).toHaveBeenNthCalledWith(1, 200); // 200 * 2^0
        expect(sleep).toHaveBeenNthCalledWith(2, 400); // 200 * 2^1
        expect(logger.warn).toHaveBeenCalledTimes(3);
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
            'Operation failed permanently after retries',
            expect.objectContaining({
                tenantId: 'tenant-1',
                operation: 'OP_FAIL',
                attempts: 3,
                error: 'Database down',
            }),
        );
    });

    test('no sleep when attempts is 1 and operation fails', async () => {
        const sleep = makeSleep();
        const logger = makeLogger();
        const executor = new RetryExecutor(sleep, logger);
        const op = vi.fn().mockRejectedValue(new Error('instant fail'));

        await expect(
            executor.run('tenant-1', 'OP_ONCE', op, { attempts: 1, baseDelayMs: 1000 }),
        ).rejects.toThrow('instant fail');

        expect(op).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});

describe('reconcile()', () => {
    const makeAudit = (): AuditPort => ({
        append: vi.fn().mockResolvedValue(undefined),
    });
    const makeLogger = (): LoggerPort => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    });

    const createSource = (pos: string[], reqs: string[]): ReconciliationSource => ({
        listOpenPurchaseOrderIds: vi.fn().mockResolvedValue(pos),
        listActiveRequirementIds: vi.fn().mockResolvedValue(reqs),
    });

    const createStore = (
        pos: string[],
        reqs: string[],
        allocations: string[],
    ): ReconciliationStore => ({
        listOpenPurchaseOrderIds: vi.fn().mockResolvedValue(pos),
        listActiveRequirementIds: vi.fn().mockResolvedValue(reqs),
        listActiveAllocationIds: vi.fn().mockResolvedValue(allocations),
        recordMismatch: vi.fn().mockResolvedValue(undefined),
    });

    test('no mismatches when source and store match completely', async () => {
        const source = createSource(['po-1', 'po-2'], ['req-1', 'req-2']);
        const store = createStore(['po-1', 'po-2'], ['req-1', 'req-2'], ['req-1', 'req-2']);
        const audit = makeAudit();
        const logger = makeLogger();

        await reconcile('tenant-1', source, store, audit, logger);

        expect(store.recordMismatch).not.toHaveBeenCalled();
        expect(audit.append).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith('Starting reconciliation', { tenantId: 'tenant-1' });
        expect(logger.info).toHaveBeenCalledWith('Reconciliation completed', { tenantId: 'tenant-1' });
    });

    test('PO missing in STORE (present in source, absent in store)', async () => {
        const source = createSource(['po-1', 'po-missing-in-store'], ['req-1']);
        const store = createStore(['po-1'], ['req-1'], ['req-1']);
        const audit = makeAudit();
        const logger = makeLogger();

        await reconcile('tenant-1', source, store, audit, logger);

        expect(store.recordMismatch).toHaveBeenCalledTimes(1);
        expect(store.recordMismatch).toHaveBeenCalledWith('PO', 'STORE', 'po-missing-in-store');
        expect(audit.append).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                type: 'RECONCILIATION_MISMATCH',
                entityId: 'po-missing-in-store',
                payload: { entityType: 'PO', missingIn: 'STORE' },
            }),
        );
        expect(logger.warn).toHaveBeenCalledWith(
            'Reconciliation mismatch',
            expect.objectContaining({
                tenantId: 'tenant-1',
                type: 'PO',
                missingIn: 'STORE',
                entityId: 'po-missing-in-store',
            }),
        );
    });

    test('PO missing in SOURCE (ghost PO present in store, absent in source)', async () => {
        const source = createSource(['po-1'], ['req-1']);
        const store = createStore(['po-1', 'po-ghost'], ['req-1'], ['req-1']);
        const audit = makeAudit();
        const logger = makeLogger();

        await reconcile('tenant-1', source, store, audit, logger);

        expect(store.recordMismatch).toHaveBeenCalledTimes(1);
        expect(store.recordMismatch).toHaveBeenCalledWith('PO', 'SOURCE', 'po-ghost');
        expect(audit.append).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                type: 'RECONCILIATION_MISMATCH',
                entityId: 'po-ghost',
                payload: { entityType: 'PO', missingIn: 'SOURCE' },
            }),
        );
    });

    test('REQUIREMENT mismatch in both directions', async () => {
        const source = createSource(['po-1'], ['req-common', 'req-src-only']);
        const store = createStore(['po-1'], ['req-common', 'req-store-only'], ['req-common']);
        const audit = makeAudit();
        const logger = makeLogger();

        await reconcile('tenant-1', source, store, audit, logger);

        expect(store.recordMismatch).toHaveBeenCalledWith('REQUIREMENT', 'STORE', 'req-src-only');
        expect(store.recordMismatch).toHaveBeenCalledWith('REQUIREMENT', 'SOURCE', 'req-store-only');
    });

    test('ALLOCATION mismatch when allocation exists for requirement missing in source', async () => {
        const source = createSource(['po-1'], ['req-active']);
        const store = createStore(['po-1'], ['req-active'], ['req-active', 'req-orphaned-alloc']);
        const audit = makeAudit();
        const logger = makeLogger();

        await reconcile('tenant-1', source, store, audit, logger);

        expect(store.recordMismatch).toHaveBeenCalledWith('ALLOCATION', 'SOURCE', 'req-orphaned-alloc');
        expect(audit.append).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                type: 'RECONCILIATION_MISMATCH',
                entityId: 'req-orphaned-alloc',
                payload: { entityType: 'ALLOCATION', missingIn: 'SOURCE' },
            }),
        );
    });

    test('multiple mismatches across PO, REQUIREMENT and ALLOCATION are all captured', async () => {
        const source = createSource(['po-source-extra'], ['req-source-extra']);
        const store = createStore(
            ['po-store-extra'],
            ['req-store-extra'],
            ['req-dangling-alloc'],
        );
        const audit = makeAudit();
        const logger = makeLogger();

        await reconcile('tenant-1', source, store, audit, logger);

        const calls = (store.recordMismatch as ReturnType<typeof vi.fn>).mock.calls;
        const mismatchTuples = calls.map(([type, dir, id]: [string, string, string]) => `${type}:${dir}:${id}`);

        expect(mismatchTuples).toContain('PO:STORE:po-source-extra');
        expect(mismatchTuples).toContain('PO:SOURCE:po-store-extra');
        expect(mismatchTuples).toContain('REQUIREMENT:STORE:req-source-extra');
        expect(mismatchTuples).toContain('REQUIREMENT:SOURCE:req-store-extra');
        expect(mismatchTuples).toContain('ALLOCATION:SOURCE:req-dangling-alloc');
        expect(audit.append).toHaveBeenCalledTimes(5);
    });
});
