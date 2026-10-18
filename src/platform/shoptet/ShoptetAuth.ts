import type { ShoptetConfig } from './ShoptetConfig.js';

export class ShoptetAuthError extends Error {
    public constructor(message: string) { super(message); this.name = 'ShoptetAuthError'; }
}

/**
 * Install callback: exchanges the one-time `code` for the permanent OAuth access token.
 * Must finish well under Shoptet's 5 s install deadline → hard 4 s timeout.
 */
export async function exchangeInstallCode(config: ShoptetConfig, code: string, request: typeof fetch = fetch): Promise<{ oauthAccessToken: string; eshopId: string; eshopUrl?: string }> {
    const response = await request(config.oauthTokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            client_id: config.clientId,
            ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
            code,
            grant_type: 'authorization_code',
            redirect_uri: config.redirectUri,
            scope: 'api',
        }),
        signal: AbortSignal.timeout(4_000),
    });
    // Never include the response body: it may contain the token.
    if (!response.ok) throw new ShoptetAuthError(`OAuth code exchange failed: HTTP ${response.status}`);
    const json = await response.json() as { access_token?: unknown; eshopId?: unknown; eshopUrl?: unknown };
    if (typeof json.access_token !== 'string' || json.access_token.length < 32) throw new ShoptetAuthError('OAuth response has no access_token');
    if ((typeof json.eshopId !== 'number' && typeof json.eshopId !== 'string') || !/^\d{1,12}$/.test(String(json.eshopId))) {
        throw new ShoptetAuthError('OAuth response has no valid eshopId');
    }
    return {
        oauthAccessToken: json.access_token,
        eshopId: String(json.eshopId),
        ...(typeof json.eshopUrl === 'string' ? { eshopUrl: json.eshopUrl } : {}),
    };
}

interface CachedToken { token: string; expiresAt: number }

/**
 * Short-lived API access tokens (30 min). Cached per OAuth token in the isolate, renewed 2 min before expiry
 * or immediately after a 401. Shoptet allows max. 5 valid tokens per installation – caching keeps us far below.
 */
export class ShoptetAccessTokenProvider {
    private readonly cache = new Map<string, CachedToken>();
    private readonly inflight = new Map<string, Promise<string>>();

    public constructor(
        private readonly config: ShoptetConfig,
        private readonly request: typeof fetch = fetch,
        private readonly now: () => number = () => Date.now(),
    ) {}

    public async get(oauthAccessToken: string): Promise<string> {
        const key = await fingerprint(oauthAccessToken);
        const cached = this.cache.get(key);
        if (cached && cached.expiresAt - 120_000 > this.now()) return cached.token;
        let pending = this.inflight.get(key);
        if (!pending) {
            pending = this.fetchToken(oauthAccessToken, key).finally(() => this.inflight.delete(key));
            this.inflight.set(key, pending);
        }
        return pending;
    }

    public async invalidate(oauthAccessToken: string): Promise<void> {
        this.cache.delete(await fingerprint(oauthAccessToken));
    }

    private async fetchToken(oauthAccessToken: string, key: string): Promise<string> {
        const response = await this.request(this.config.accessTokenUrl, {
            method: 'GET',
            headers: { Authorization: `Bearer ${oauthAccessToken}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new ShoptetAuthError(`API access token request failed: HTTP ${response.status}`);
        const json = await response.json() as { access_token?: unknown; expires_in?: unknown };
        if (typeof json.access_token !== 'string' || json.access_token.length < 10) throw new ShoptetAuthError('Access token response has no access_token');
        const ttl = typeof json.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : 1800;
        this.cache.set(key, { token: json.access_token, expiresAt: this.now() + ttl * 1000 });
        return json.access_token;
    }
}

/** Cache key that never keeps the raw OAuth token in a Map key. */
async function fingerprint(value: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    return Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}
