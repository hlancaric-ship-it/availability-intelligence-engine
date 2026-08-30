import { describe, test, expect, vi } from 'vitest';
import { InMemoryMetricsCollector, AlertManager } from '../src/platform/operations/ObservabilityAndAlerts.js';
import type { AlertRule, AlertNotifierPort } from '../src/platform/operations/ObservabilityAndAlerts.js';
import type { LoggerPort } from '../src/core/procurement/ports.js';

describe('Phase 5 - Observability & Alerts', () => {
    const makeLogger = (): LoggerPort => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    });

    test('InMemoryMetricsCollector records counters, gauges and durations', () => {
        const collector = new InMemoryMetricsCollector();

        collector.increment('procurement_cycle_runs_total', 1, { tenantId: 't1' });
        collector.recordGauge('unfulfilled_demand_count', 4, { tenantId: 't1' });
        collector.recordDuration('procurement_cycle_duration_ms', 245, { tenantId: 't1' });

        const metrics = collector.getMetrics();
        expect(metrics).toHaveLength(3);
        expect(metrics[0]!.name).toBe('procurement_cycle_runs_total');
        expect(metrics[0]!.value).toBe(1);
        expect(metrics[1]!.name).toBe('unfulfilled_demand_count');
        expect(metrics[1]!.value).toBe(4);
        expect(metrics[2]!.name).toBe('procurement_cycle_duration_ms');
        expect(metrics[2]!.value).toBe(245);

        collector.clear();
        expect(collector.getMetrics()).toEqual([]);
    });

    test('AlertManager evaluates rules and notifies on threshold triggers', async () => {
        const collector = new InMemoryMetricsCollector();
        collector.increment('reconciliation_mismatches_total', 5, { tenantId: 't1' });

        const notifier: AlertNotifierPort = {
            notify: vi.fn().mockResolvedValue(undefined),
        };
        const logger = makeLogger();

        const rules: AlertRule[] = [
            {
                name: 'HIGH_RECONCILIATION_MISMATCH_RATE',
                condition: (metrics) => {
                    const sum = metrics
                        .filter((m) => m.name === 'reconciliation_mismatches_total')
                        .reduce((acc, m) => acc + m.value, 0);
                    return {
                        triggered: sum > 3,
                        message: `Reconciliation mismatches exceeded threshold: ${sum} > 3`,
                    };
                },
            },
            {
                name: 'NO_SUPPLIER_OFFER_ALERT',
                condition: (metrics) => {
                    const found = metrics.some((m) => m.name === 'no_supplier_offers_total' && m.value > 0);
                    return { triggered: found };
                },
            },
        ];

        const manager = new AlertManager(collector, notifier, logger, rules);
        const triggered = await manager.evaluateRules();

        expect(triggered).toHaveLength(1);
        expect(triggered[0]!.ruleName).toBe('HIGH_RECONCILIATION_MISMATCH_RATE');
        expect(triggered[0]!.message).toContain('Reconciliation mismatches exceeded threshold: 5 > 3');
        expect(notifier.notify).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(
            'Alert triggered: HIGH_RECONCILIATION_MISMATCH_RATE',
            expect.anything(),
        );
    });

    test('AlertManager handles faulty rule gracefully without breaking evaluation', async () => {
        const collector = new InMemoryMetricsCollector();
        const notifier: AlertNotifierPort = { notify: vi.fn() };
        const logger = makeLogger();

        const rules: AlertRule[] = [
            {
                name: 'FAULTY_RULE',
                condition: () => {
                    throw new Error('Rule calculation error');
                },
            },
        ];

        const manager = new AlertManager(collector, notifier, logger, rules);
        const triggered = await manager.evaluateRules();

        expect(triggered).toEqual([]);
        expect(notifier.notify).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(
            'Error evaluating alert rule: FAULTY_RULE',
            expect.objectContaining({ error: 'Rule calculation error' }),
        );
    });
});
