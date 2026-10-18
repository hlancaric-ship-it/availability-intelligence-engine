import type { PlatformCredentialsPort } from '../../core/platform/PlatformAdapter.js';
import type { TransactionalSql } from './PostgresProcurementRepository.js';

/**
 * Platform credentials (OAuth tokens, API keys, webhook secrets) encrypted with AES-256-GCM (WebCrypto,
 * works on Cloudflare Workers and Node ≥ 20). The key comes from a secret (`CREDENTIALS_ENCRYPTION_KEY`,
 * 32 random bytes, base64) – never from the database. The tenant ID is bound as AAD, so a ciphertext copied
 * to another tenant's row fails to decrypt.
 */
export class EncryptedPostgresCredentialsStore implements PlatformCredentialsPort {
    private keyPromise: Promise<CryptoKey> | undefined;

    public constructor(private readonly db: TransactionalSql, private readonly base64Key: string) {
        if (!base64Key) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured');
        // Fail fast at startup instead of on the first install.
        let length = -1;
        try { length = fromB64(base64Key).byteLength; } catch { /* invalid base64 */ }
        if (length !== 32) throw new Error('CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (base64)');
    }

    public async get(tenantId: string): Promise<Readonly<Record<string, string>> | undefined> {
        const res = await this.db.transaction((tx) => tx.query<{ iv: string; ciphertext: string }>(
            'SELECT iv, ciphertext FROM tenant_credentials WHERE tenant_id = $1', [tenantId]));
        const row = res.rows?.[0];
        if (!row) return undefined;
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: fromB64(row.iv), additionalData: utf8(tenantId) }, await this.key(), fromB64(row.ciphertext));
        return Object.freeze(JSON.parse(new TextDecoder().decode(plain)) as Record<string, string>);
    }

    public async put(tenantId: string, credentials: Readonly<Record<string, string>>): Promise<void> {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const cipher = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv, additionalData: utf8(tenantId) }, await this.key(), utf8(JSON.stringify(credentials)));
        await this.db.transaction((tx) => tx.query(
            `INSERT INTO tenant_credentials (tenant_id, iv, ciphertext, updated_at) VALUES ($1, $2, $3, NOW())
             ON CONFLICT (tenant_id) DO UPDATE SET iv = EXCLUDED.iv, ciphertext = EXCLUDED.ciphertext, updated_at = NOW()`,
            [tenantId, toB64(iv), toB64(new Uint8Array(cipher))]));
    }

    public async delete(tenantId: string): Promise<void> {
        await this.db.transaction((tx) => tx.query('DELETE FROM tenant_credentials WHERE tenant_id = $1', [tenantId]));
    }

    private key(): Promise<CryptoKey> {
        this.keyPromise ??= (async () => {
            const raw = fromB64(this.base64Key);
            if (raw.byteLength !== 32) throw new Error('CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (base64)');
            return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
        })();
        return this.keyPromise;
    }
}

function utf8(s: string): Uint8Array<ArrayBuffer> { return new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>; }
function toB64(bytes: Uint8Array): string { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function fromB64(b64: string): Uint8Array<ArrayBuffer> { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
