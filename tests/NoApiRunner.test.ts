import { expect, test, vi, describe } from 'vitest';
import { NoApiRunner } from '../src/platform/operations/NoApiRunner.js';
import { NoApiCsvAdapter } from '../src/platform/suppliers/NoApiCsvAdapter.js';
import { RetryExecutor } from '../src/platform/operations/RetryAndReconciliation.js';

function makeWorkflow() {
    return {
        createPlan: vi.fn().mockResolvedValue(undefined),
        receive: vi.fn().mockResolvedValue([]),
        cancelPurchaseOrder: vi.fn(),
        approvePurchaseOrder: vi.fn(),
        syncSupplierStatus: vi.fn().mockResolvedValue(undefined),
    };
}

function makeRunner(workflow = makeWorkflow()) {
    const blob = {
        getLatestOfferFile: vi.fn(),
        readOfferFile: vi.fn(),
        listPendingReceiptFiles: vi.fn().mockResolvedValue([]),
        readReceiptFile: vi.fn(),
        archiveReceiptFile: vi.fn().mockResolvedValue(undefined),
        writePurchaseOrderExport: vi.fn(),
    };
    const adapter = new NoApiCsvAdapter();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const audit = { append: vi.fn() };
    const retryExecutor = new RetryExecutor(async () => {}, logger);
    return { runner: new NoApiRunner(workflow as any, blob, adapter, logger, audit, retryExecutor), blob, logger, audit, workflow };
}

describe('NoApiRunner', () => {
    test('processPendingReceipts: no files → no workflow calls', async () => {
        const { runner, workflow } = makeRunner();
        await runner.processPendingReceipts('t1', 'sup1');
        expect(workflow.receive).not.toHaveBeenCalled();
    });

    test('processPendingReceipts: valid CSV file → workflow.receive called', async () => {
        const wf = makeWorkflow();
        const { runner, blob } = makeRunner(wf);
        const csv = 'purchaseOrderId,procurementLineId,receivedQuantity\npo1,line1,5\n';
        blob.listPendingReceiptFiles.mockResolvedValue(['file-1.csv']);
        blob.readReceiptFile.mockResolvedValue(csv);

        await runner.processPendingReceipts('t1', 'sup1');

        expect(wf.receive).toHaveBeenCalledWith('t1', 'receipt-file-1.csv', [
            { purchaseOrderId: 'po1', procurementLineId: 'line1', receivedQuantity: 5 }
        ]);
        expect(blob.archiveReceiptFile).toHaveBeenCalledWith('file-1.csv');
    });

    test('processPendingReceipts: workflow failure is caught, audit appended', async () => {
        const wf = makeWorkflow();
        wf.receive.mockRejectedValue(new Error('DB down'));
        const { runner, blob, audit } = makeRunner(wf);
        blob.listPendingReceiptFiles.mockResolvedValue(['file-err.csv']);
        blob.readReceiptFile.mockResolvedValue('purchaseOrderId,procurementLineId,receivedQuantity\npo1,l1,3\n');

        await runner.processPendingReceipts('t1', 'sup1');

        expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({ type: 'NO_API_RUNNER_FAILED' }));
    });

    test('runProcurementCycle: calls workflow.createPlan with correct args', async () => {
        const wf = makeWorkflow();
        const { runner } = makeRunner(wf);
        await runner.runProcurementCycle('t1', { approvalMode: 'automatic' }, 'cycle-001');
        expect(wf.createPlan).toHaveBeenCalledWith('t1', 'cycle-001', { approvalMode: 'automatic' });
    });

    test('runProcurementCycle: permanent failure logs and appends audit without throwing', async () => {
        const wf = makeWorkflow();
        wf.createPlan.mockRejectedValue(new Error('engine down'));
        const { runner, audit } = makeRunner(wf);

        await expect(runner.runProcurementCycle('t1', { approvalMode: 'manual' }, 'cycle-fail')).resolves.toBeUndefined();
        expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({ type: 'PROCUREMENT_CYCLE_FAILED' }));
    });

    test('syncSupplierStatus: delegates to workflow.syncSupplierStatus', async () => {
        const wf = makeWorkflow();
        const { runner } = makeRunner(wf);
        await runner.syncSupplierStatus('t1', 'sync-001');
        expect(wf.syncSupplierStatus).toHaveBeenCalledWith('t1', 'sync-001');
    });

    test('syncSupplierStatus: permanent failure appends audit without throwing', async () => {
        const wf = makeWorkflow();
        wf.syncSupplierStatus.mockRejectedValue(new Error('supplier API down'));
        const { runner, audit } = makeRunner(wf);

        await expect(runner.syncSupplierStatus('t1', 'sync-fail')).resolves.toBeUndefined();
        expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({ type: 'SUPPLIER_STATUS_SYNC_FAILED' }));
    });
});
