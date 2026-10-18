import { describe, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import type { SqlQueryResult, TransactionalSql } from '../src/platform/persistence/PostgresProcurementRepository.js';
import { TENANT_TABLES, TenantLifecycleService } from '../src/platform/operations/TenantLifecycle.js';
import { PostgresTenantRegistry } from '../src/platform/operations/Scheduler.js';
import { PostgresDashboardReader } from '../src/platform/operations/DashboardEndpoint.js';
import { EncryptedPostgresCredentialsStore } from '../src/platform/persistence/EncryptedPostgresCredentialsStore.js';

const dir = new URL('../migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

/** Runs every migration in order against a real (in-process) PostgreSQL. */
async function migratedDb(): Promise<PGlite> {
    const pg = new PGlite();
    for (const f of files) await pg.exec(readFileSync(new URL(f, dir), 'utf8'));
    return pg;
}

function asTransactional(pg: PGlite): TransactionalSql {
    return {
        transaction: (work) => pg.transaction(async (tx) => work({
            query: async <T>(sql: string, values?: unknown[]): Promise<SqlQueryResult<T>> => {
                const r = await tx.query<T>(sql, values as any[]);
                return { rowCount: r.affectedRows ?? r.rows.length, rows: r.rows };
            },
        })),
    };
}

const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

describe('Migrace proti skutečnému PostgreSQL (PGlite)', () => {
    test('všechny migrace 001 → poslední projdou a vytvoří očekávané tabulky', async () => {
        const pg = await migratedDb();
        const r = await pg.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1");
        expect(r.rows.map((x) => x.table_name)).toEqual([
            'fulfillment_order_lines', 'fulfillment_orders', 'packaging_deposit_rules', 'procurement_audit_log',
            'procurement_idempotency_keys', 'procurement_purchase_order_lines', 'procurement_purchase_orders',
            'procurement_supplier_offers', 'sales_units', 'tenant_credentials', 'tenants',
        ]);
        await pg.close();
    }, 30_000);

    test('instalace → data → odinstalace smaže vše daného e-shopu a nic jiného', async () => {
        const pg = await migratedDb();
        const db = asTransactional(pg);
        const creds = new EncryptedPostgresCredentialsStore(db, Buffer.alloc(32, 1).toString('base64'));
        const audit = { append: async () => undefined };
        const life = new TenantLifecycleService(db, creds, audit, quiet);
        const a = await life.install('shoptet', { platformShopId: '111', credentials: { oauth: 'A' } });
        const b = await life.install('shoptet', { platformShopId: '222', credentials: { oauth: 'B' } });

        for (const t of [a, b]) {
            await pg.query(`INSERT INTO procurement_purchase_orders (id, tenant_id, supplier_id, status) VALUES ($1, $2, 's', 'DRAFT')`, [`${t}:po`, t]);
            await pg.query(`INSERT INTO procurement_purchase_order_lines (id, purchase_order_id, customer_order_line_id, product_id, variant_id, supplier_sku, quantity, unit_price, currency)
                            VALUES ($1, $2, 'c', 'p', 'v', 'x', 1, 1, 'CZK')`, [`${t}:l`, `${t}:po`]);
            await pg.query(`INSERT INTO fulfillment_orders (tenant_id, order_id, status, version) VALUES ($1, 'O1', 'READY_TO_PACK', 1)`, [t]);
            await pg.query(`INSERT INTO procurement_audit_log (tenant_id, event_type, entity_id, payload, occurred_at) VALUES ($1, 'X', 'e', '{}', NOW())`, [t]);
            await pg.query(`INSERT INTO procurement_idempotency_keys (key, operation, state) VALUES ($1, 'OP', 'COMPLETED')`, [`${t}:ev`]);
        }

        expect((await new PostgresTenantRegistry(db).getTenant(a))?.approvalMode).toBe('manual');
        expect((await new PostgresDashboardReader(db).getDashboardData(a)).ready).toHaveLength(1);

        await life.uninstall(a);

        const count = async (sql: string, p: unknown[]) => Number((await pg.query<{ n: string }>(sql, p as any[])).rows[0]!.n);
        for (const t of TENANT_TABLES) expect(await count(`SELECT COUNT(*) AS n FROM ${t} WHERE tenant_id = $1`, [a])).toBe(0);
        expect(await count('SELECT COUNT(*) AS n FROM procurement_purchase_order_lines WHERE id LIKE $1', [`${a}:%`])).toBe(0);
        expect(await count('SELECT COUNT(*) AS n FROM procurement_idempotency_keys WHERE key LIKE $1', [`${a}:%`])).toBe(0);
        expect(await count('SELECT COUNT(*) AS n FROM tenants WHERE tenant_id = $1', [a])).toBe(0);
        expect(await creds.get(a)).toBeUndefined();

        // The other shop is untouched.
        expect(await count('SELECT COUNT(*) AS n FROM procurement_purchase_order_lines WHERE id LIKE $1', [`${b}:%`])).toBe(1);
        expect(await count('SELECT COUNT(*) AS n FROM fulfillment_orders WHERE tenant_id = $1', [b])).toBe(1);
        expect(await creds.get(b)).toEqual({ oauth: 'B' });
        await pg.close();
    }, 30_000);
});
