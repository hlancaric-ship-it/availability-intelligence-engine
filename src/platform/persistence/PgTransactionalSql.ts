import type { SqlQueryResult, SqlTransaction, TransactionalSql } from './PostgresProcurementRepository.js';

/** Minimal subset of `pg.Client` we depend on (keeps the core testable without a database). */
export interface PgLikeClient {
    query(sql: string, values?: unknown[]): Promise<{ rowCount: number | null; rows: unknown[] }>;
}

/**
 * TransactionalSql over a single PostgreSQL connection.
 *
 * Cloudflare Workers: create one `pg.Client` per request from `env.HYPERDRIVE.connectionString`
 * (Hyperdrive pools the real connections), then `client.end()` via `ctx.waitUntil`.
 * Transactions on one client are serialised so concurrent `transaction()` calls never interleave.
 */
export class PgTransactionalSql implements TransactionalSql {
    private queue: Promise<unknown> = Promise.resolve();

    public constructor(private readonly client: PgLikeClient) {}

    public transaction<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
        const run = async (): Promise<T> => {
            await this.client.query('BEGIN');
            const tx: SqlTransaction = {
                query: async <TRow = unknown>(sql: string, values?: unknown[]): Promise<SqlQueryResult<TRow>> => {
                    const res = await this.client.query(sql, values);
                    return { rowCount: res.rowCount ?? 0, rows: res.rows as TRow[] };
                },
            };
            try {
                const result = await work(tx);
                await this.client.query('COMMIT');
                return result;
            } catch (error) {
                try { await this.client.query('ROLLBACK'); } catch { /* connection may be gone; original error wins */ }
                throw error;
            }
        };
        const next = this.queue.then(run, run);
        this.queue = next.catch(() => undefined);
        return next;
    }
}
