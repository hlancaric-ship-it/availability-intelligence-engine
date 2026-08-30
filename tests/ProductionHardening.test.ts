import { describe, test, expect, vi } from 'vitest';
import { InMemoryTenantSecretsManager, HealthAndLifecycleManager } from '../src/platform/operations/ProductionHardening.js';
import type { SqlTransaction, SqlQueryResult } from '../src/platform/persistence/PostgresProcurementRepository.js';
import type { LoggerPort } from '../src/core/procurement/ports.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

describe('Phase 8 - InMemoryTenantSecretsManager', () => {
    test('stores and retrieves tenant secrets securely per tenantId', async () => {
        const manager = new InMemoryTenantSecretsManager();

        await manager.registerSecrets({
            tenantId: 'tenant-1',
            apiKey: 'key-123',
            apiSecret: 'secret-xyz',
        });

        const found = await manager.getSecrets('tenant-1');
        expect(found).toEqual({
            tenantId: 'tenant-1',
            apiKey: 'key-123',
            apiSecret: 'secret-xyz',
        });

        const notFound = await manager.getSecrets('non-existent');
        expect(notFound).toBeUndefined();
    });
});

describe('Phase 8 - HealthAndLifecycleManager', () => {
    const makeLogger = (): LoggerPort => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

    test('reports HEALTHY when DB is reachable', async () => {
        const tx: SqlTransaction = {
            query: vi.fn().mockResolvedValue({ rowCount: 1 } as SqlQueryResult<unknown>),
        };
        const db = {
            transaction: vi.fn().mockImplementation(async (work: (t: SqlTransaction) => Promise<unknown>) => work(tx)),
        };
        const logger = makeLogger();

        const manager = new HealthAndLifecycleManager(db, logger);
        const health = await manager.checkHealth();

        expect(health.status).toBe('HEALTHY');
        expect(health.checks.database).toBe('OK');
    });

    test('reports UNHEALTHY when DB fails', async () => {
        const db = {
            transaction: vi.fn().mockRejectedValue(new Error('Connection timeout')),
        };
        const logger = makeLogger();

        const manager = new HealthAndLifecycleManager(db, logger);
        const health = await manager.checkHealth();

        expect(health.status).toBe('UNHEALTHY');
        expect(health.checks.database).toBe('ERROR');
    });

    test('executes graceful shutdown hooks and marks service UNHEALTHY', async () => {
        const tx: SqlTransaction = {
            query: vi.fn().mockResolvedValue({ rowCount: 1 } as SqlQueryResult<unknown>),
        };
        const db = {
            transaction: vi.fn().mockImplementation(async (work: (t: SqlTransaction) => Promise<unknown>) => work(tx)),
        };
        const logger = makeLogger();

        const manager = new HealthAndLifecycleManager(db, logger);
        const hook = vi.fn().mockResolvedValue(undefined);
        manager.onShutdown(hook);

        await manager.triggerGracefulShutdown();

        expect(hook).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith('Graceful shutdown initiated');
        expect(logger.info).toHaveBeenCalledWith('Graceful shutdown completed');

        const health = await manager.checkHealth();
        expect(health.status).toBe('UNHEALTHY');
    });

    test('handles HTTP GET /health returning 200 JSON when healthy', async () => {
        const tx: SqlTransaction = {
            query: vi.fn().mockResolvedValue({ rowCount: 1 } as SqlQueryResult<unknown>),
        };
        const db = {
            transaction: vi.fn().mockImplementation(async (work: (t: SqlTransaction) => Promise<unknown>) => work(tx)),
        };
        const logger = makeLogger();

        const manager = new HealthAndLifecycleManager(db, logger);

        const req = {
            url: '/health',
            method: 'GET',
            headers: { host: 'localhost:8080' },
        } as unknown as IncomingMessage;

        let status = 0;
        let body = '';
        const res = {
            writeHead: vi.fn().mockImplementation((code: number) => { status = code; }),
            end: vi.fn().mockImplementation((data: string) => { body = data; }),
        } as unknown as ServerResponse;

        await manager.handleHealthHttp(req, res);

        expect(status).toBe(200);
        const parsed = JSON.parse(body);
        expect(parsed.status).toBe('HEALTHY');
        expect(parsed.checks.database).toBe('OK');
    });
});
