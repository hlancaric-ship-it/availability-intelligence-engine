import { DEFAULT_PAYMENT_GATE } from './types.js';
import type { PaymentGatePolicy, PaymentInfo } from './types.js';

/**
 * Decides whether a customer order is cleared by payment.
 *
 * Used for three decisions, always with the same rule:
 *  1. purchasing missing units from a supplier (ProcurementEngine.plan),
 *  2. reserving own stock (ProcurementEngine.plan),
 *  3. releasing the order for picking / packing / shipping (FulfillmentReadinessPort.markReadyToShip
 *     implementations must call this again with FRESH payment data at release time).
 *
 * Fail-safe: while the gate is enabled, missing payment information is treated as NOT cleared.
 * Cash on delivery is recognised by status 'COD' or by method 'COD' (some platforms report COD orders as UNPAID).
 */
export function isPaymentCleared(info: PaymentInfo | undefined, gate: PaymentGatePolicy = DEFAULT_PAYMENT_GATE): boolean {
    if (!gate.enabled) return true;
    if (!info) return false;
    if (gate.allowedStatuses.includes(info.paymentStatus)) return true;
    return info.paymentMethod === 'COD' && info.paymentStatus === 'UNPAID' && gate.allowedStatuses.includes('COD');
}

/** Splits items into cleared / awaiting payment. Generic so readiness implementations can reuse it. */
export function partitionByPayment<T>(items: readonly T[], getInfo: (item: T) => PaymentInfo | undefined, gate: PaymentGatePolicy = DEFAULT_PAYMENT_GATE): { cleared: T[]; awaitingPayment: T[] } {
    const cleared: T[] = [];
    const awaitingPayment: T[] = [];
    for (const item of items) (isPaymentCleared(getInfo(item), gate) ? cleared : awaitingPayment).push(item);
    return { cleared, awaitingPayment };
}
