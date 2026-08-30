import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TransactionalSql } from '../persistence/PostgresProcurementRepository.js';
import type { LoggerPort } from '../../core/procurement/ports.js';

export interface TenantSecretConfig {
    tenantId: string;
    apiKey: string;
    apiSecret?: string;
    webhookSecret?: string;
}

export interface TenantSecretsPort {
    getSecrets(tenantId: string): Promise<TenantSecretConfig | undefined>;
    registerSecrets(config: TenantSecretConfig): Promise<void>;
}

export class InMemoryTenantSecretsManager implements TenantSecretsPort {
    private readonly store = new Map<string, TenantSecretConfig>();

    public async getSecrets(tenantId: string): Promise<TenantSecretConfig | undefined> {
        return this.store.get(tenantId);
    }

    public async registerSecrets(config: TenantSecretConfig): Promise<void> {
        this.store.set(config.tenantId, config);
    }
}

export interface HealthCheckResult {
    status: 'HEALTHY' | 'UNHEALTHY';
    checks: {
        database: 'OK' | 'ERROR';
        uptimeSeconds: number;
    };
    timestamp: string;
}

export class HealthAndLifecycleManager {
    private isShuttingDown = false;
    private readonly startTime = Date.now();
    private readonly shutdownHooks: (() => Promise<void>)[] = [];

    public constructor(
        private readonly db: TransactionalSql,
        private readonly logger: LoggerPort,
    ) {}

    public onShutdown(hook: () => Promise<void>): void {
        this.shutdownHooks.push(hook);
    }

    public async checkHealth(): Promise<HealthCheckResult> {
        if (this.isShuttingDown) {
            return {
                status: 'UNHEALTHY',
                checks: { database: 'ERROR', uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000) },
                timestamp: new Date().toISOString(),
            };
        }

        let dbStatus: 'OK' | 'ERROR' = 'OK';
        try {
            await this.db.transaction(async (tx) => {
                await tx.query('SELECT 1');
            });
        } catch {
            dbStatus = 'ERROR';
        }

        const isHealthy = dbStatus === 'OK';
        return {
            status: isHealthy ? 'HEALTHY' : 'UNHEALTHY',
            checks: {
                database: dbStatus,
                uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
            },
            timestamp: new Date().toISOString(),
        };
    }

    public async triggerGracefulShutdown(): Promise<void> {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;
        this.logger.info('Graceful shutdown initiated');

        for (const hook of this.shutdownHooks) {
            try {
                await hook();
            } catch (err) {
                const error = err instanceof Error ? err.message : 'Unknown error';
                this.logger.error('Error during shutdown hook execution', { error });
            }
        }

        this.logger.info('Graceful shutdown completed');
    }

    public async handleHealthHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        if (req.method === 'GET' && url.pathname === '/health') {
            const health = await this.checkHealth();
            const statusCode = health.status === 'HEALTHY' ? 200 : 503;
            res.writeHead(statusCode, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
            });
            res.end(JSON.stringify(health));
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
}
