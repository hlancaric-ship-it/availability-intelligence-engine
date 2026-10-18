import type { GoodsReceiptLine, PurchaseOrder } from '../procurement/types.js';
import { normalizeCode } from './FulfillmentEngine.js';

export type ReceivingScanError = 'INVALID_CODE' | 'UNEXPECTED_PRODUCT' | 'OVER_RECEIPT';

export type ReceivingScanResult =
    | { ok: true; purchaseOrderId: string; procurementLineId: string; customerOrderLineId: string; sku: string; scannedForLine: number; remainingForLine: number }
    | { ok: false; error: ReceivingScanError; code: string };

/** Optional barcode lookup: SKU → EAN(s), provided by the platform/catalog adapter. */
export type EanLookup = (sku: string) => readonly string[] | undefined;

const RECEIVABLE = new Set<PurchaseOrder['status']>(['SENT', 'PARTIALLY_RECEIVED']);

/**
 * Scanner-driven goods receipt (one unit per scan), platform-neutral and in-memory.
 * The session only collects scans; `toReceipt()` produces GoodsReceiptLine[] for ProcurementWorkflow.receive,
 * which then allocates units to the customer orders and persists everything idempotently.
 *
 * Matching: scanned code = our SKU, supplier SKU, or EAN (via lookup). If several open lines match,
 * the line serving the oldest purchase order (order of `purchaseOrders`) is filled first (fair queue).
 */
export class ReceivingSession {
    private readonly scanned = new Map<string, number>(); // procurementLineId → units scanned in this session
    private readonly lines: Array<{ po: PurchaseOrder; line: PurchaseOrder['lines'][number]; codes: Set<string> }>;

    public constructor(purchaseOrders: readonly PurchaseOrder[], eanLookup?: EanLookup) {
        this.lines = [];
        for (const po of purchaseOrders) {
            if (!RECEIVABLE.has(po.status)) continue;
            for (const line of po.lines) {
                const codes = new Set<string>();
                for (const c of [line.sku, line.supplierSku, ...(eanLookup?.(line.sku) ?? [])]) {
                    const n = normalizeCode(c);
                    if (n) codes.add(n);
                }
                this.lines.push({ po, line, codes });
            }
        }
    }

    public scan(rawCode: string): ReceivingScanResult {
        const code = normalizeCode(rawCode);
        if (!code) return { ok: false, error: 'INVALID_CODE', code: String(rawCode ?? '') };
        const candidates = this.lines.filter((c) => c.codes.has(code));
        if (candidates.length === 0) return { ok: false, error: 'UNEXPECTED_PRODUCT', code };
        const target = candidates.find((c) => this.remaining(c.line) > 0);
        if (!target) return { ok: false, error: 'OVER_RECEIPT', code };
        const count = (this.scanned.get(target.line.id) ?? 0) + 1;
        this.scanned.set(target.line.id, count);
        return {
            ok: true,
            purchaseOrderId: target.po.id,
            procurementLineId: target.line.id,
            customerOrderLineId: target.line.customerOrderLineId,
            sku: target.line.sku,
            scannedForLine: count,
            remainingForLine: this.remaining(target.line),
        };
    }

    /** Undo one scanned unit of a line (e.g. damaged item put aside). */
    public undo(procurementLineId: string): boolean {
        const count = this.scanned.get(procurementLineId) ?? 0;
        if (count <= 0) return false;
        if (count === 1) this.scanned.delete(procurementLineId);
        else this.scanned.set(procurementLineId, count - 1);
        return true;
    }

    public toReceipt(): GoodsReceiptLine[] {
        const receipt: GoodsReceiptLine[] = [];
        for (const { po, line } of this.lines) {
            const qty = this.scanned.get(line.id);
            if (qty) receipt.push({ purchaseOrderId: po.id, procurementLineId: line.id, receivedQuantity: qty });
        }
        return receipt;
    }

    private remaining(line: PurchaseOrder['lines'][number]): number {
        return line.quantity - line.receivedQuantity - (this.scanned.get(line.id) ?? 0);
    }
}
