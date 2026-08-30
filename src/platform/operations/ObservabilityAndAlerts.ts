import type { LoggerPort } from '../../core/procurement/ports.js';

export interface MetricEntry {
    name: string;
    value: number;
    labels?: Record<string, string>;
    timestamp: string;
}

export interface MetricsCollectorPort {
    increment(name: string, value?: number, labels?: Record<string, string>): void;
    recordGauge(name: string, value: number, labels?: Record<string, string>): void;
    recordDuration(name: string, durationMs: number, labels?: Record<string, string>): void;
    getMetrics(): MetricEntry[];
    clear(): void;
}

export class InMemoryMetricsCollector implements MetricsCollectorPort {
    private readonly entries: MetricEntry[] = [];

    public increment(name: string, value: number = 1, labels?: Record<string, string>): void {
        this.entries.push({
            name,
            value,
            ...(labels !== undefined ? { labels } : {}),
            timestamp: new Date().toISOString(),
        });
    }

    public recordGauge(name: string, value: number, labels?: Record<string, string>): void {
        this.entries.push({
            name,
            value,
            ...(labels !== undefined ? { labels } : {}),
            timestamp: new Date().toISOString(),
        });
    }

    public recordDuration(name: string, durationMs: number, labels?: Record<string, string>): void {
        this.entries.push({
            name,
            value: durationMs,
            ...(labels !== undefined ? { labels } : {}),
            timestamp: new Date().toISOString(),
        });
    }

    public getMetrics(): MetricEntry[] {
        return [...this.entries];
    }

    public clear(): void {
        this.entries.length = 0;
    }
}

export interface AlertRule {
    name: string;
    condition: (metrics: MetricEntry[]) => { triggered: boolean; message?: string };
}

export interface AlertNotification {
    ruleName: string;
    message: string;
    triggeredAt: string;
}

export interface AlertNotifierPort {
    notify(alert: AlertNotification): Promise<void>;
}

export class AlertManager {
    public constructor(
        private readonly metricsCollector: MetricsCollectorPort,
        private readonly notifier: AlertNotifierPort,
        private readonly logger: LoggerPort,
        private readonly rules: AlertRule[] = [],
    ) {}

    public async evaluateRules(): Promise<AlertNotification[]> {
        const metrics = this.metricsCollector.getMetrics();
        const triggeredAlerts: AlertNotification[] = [];

        for (const rule of this.rules) {
            try {
                const evalResult = rule.condition(metrics);
                if (evalResult.triggered) {
                    const alert: AlertNotification = {
                        ruleName: rule.name,
                        message: evalResult.message ?? `Alert ${rule.name} triggered`,
                        triggeredAt: new Date().toISOString(),
                    };
                    triggeredAlerts.push(alert);
                    this.logger.warn(`Alert triggered: ${rule.name}`, { alert });
                    await this.notifier.notify(alert);
                }
            } catch (err) {
                const error = err instanceof Error ? err.message : 'Unknown error';
                this.logger.error(`Error evaluating alert rule: ${rule.name}`, { error });
            }
        }

        return triggeredAlerts;
    }
}
