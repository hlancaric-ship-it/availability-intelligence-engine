import type { StoreStockAdjustmentPayload, PaymentInfo } from '../../core/procurement/types.js';

export interface ShoptetOutboundSyncPayload {
    orderId: string;
    customerOrderLineId: string;
    status: 'READY_TO_FULFILL' | 'PARTIALLY_AVAILABLE' | 'WAITING_FOR_STOCK';
    allocatedQuantity: number;
    syncedAt: string;
    paymentInfo?: PaymentInfo;
}

export interface ShoptetOutboundSyncPort {
    syncOrderStatus(tenantId: string, payload: ShoptetOutboundSyncPayload): Promise<{ success: boolean; externalSyncId: string }>;
    syncStockAdjustment(tenantId: string, payload: StoreStockAdjustmentPayload): Promise<{ success: boolean; externalSyncId: string }>;
}

import type { LoggerPort, AuditPort } from '../../core/procurement/ports.js';

export class MockShoptetOutboundAdapter implements ShoptetOutboundSyncPort {
    private readonly syncedPayloads: ShoptetOutboundSyncPayload[] = [];
    public shouldFail = false;

    public constructor(
        private readonly logger: LoggerPort,
        private readonly audit: AuditPort,
    ) {}

    public async syncOrderStatus(tenantId: string, payload: ShoptetOutboundSyncPayload): Promise<{ success: boolean; externalSyncId: string }> {
        if (this.shouldFail) {
            this.logger.error('Mock Shoptet outbound sync failed (simulated)', { tenantId, payload });
            throw new Error('Simulated Shoptet API network failure');
        }

        const externalSyncId = `mock-sync-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        this.syncedPayloads.push(payload);

        this.logger.info('Mock Shoptet outbound sync successful (read-only safe simulation)', {
            tenantId,
            externalSyncId,
            payload,
        });

        await this.audit.append({
            tenantId,
            type: 'SHOPTET_OUTBOUND_SYNC_SUCCESS',
            entityId: payload.orderId,
            payload: { ...payload, externalSyncId },
            occurredAt: new Date().toISOString(),
        });

        return { success: true, externalSyncId };
    }

    public async syncStockAdjustment(tenantId: string, payload: StoreStockAdjustmentPayload): Promise<{ success: boolean; externalSyncId: string }> {
        if (this.shouldFail) {
            this.logger.error('Mock Shoptet stock sync failed (simulated)', { tenantId, payload });
            throw new Error('Simulated Shoptet Stock API network failure');
        }

        const externalSyncId = `mock-stock-sync-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        this.logger.info('Mock Shoptet stock sync successful', { tenantId, externalSyncId, payload });

        await this.audit.append({
            tenantId,
            type: 'SHOPTET_STOCK_SYNC_SUCCESS',
            entityId: payload.sku,
            payload: { ...payload, externalSyncId },
            occurredAt: new Date().toISOString(),
        });

        return { success: true, externalSyncId };
    }

    public getSyncedPayloads(): ShoptetOutboundSyncPayload[] {
        return [...this.syncedPayloads];
    }

    public clear(): void {
        this.syncedPayloads.length = 0;
    }
}
