/**
 * Shoptet add-on configuration. All values come from the partner administration:
 * Partner e-shop → Propojení → API partner → Přístup k API.
 * Until every required value is set, the Shoptet adapter is NOT registered (nothing runs half-configured).
 */
export interface ShoptetConfig {
    clientId: string;
    /** Secret – `wrangler secret put SHOPTET_CLIENT_SECRET`. Optional only for old partner accounts without it. */
    clientSecret?: string;
    /** e.g. https://12345.myshoptet.com/action/ApiOAuthServer/token */
    oauthTokenUrl: string;
    /** e.g. https://12345.myshoptet.com/action/ApiOAuthServer/getAccessToken */
    accessTokenUrl: string;
    /** Must equal "Your URL to receive OAuth code" in the add-on settings, e.g. https://l-code-dynamics.com/platforms/shoptet/install */
    redirectUri: string;
    /** Public base URL where Shoptet sends webhooks, e.g. https://l-code-dynamics.com/platforms/shoptet/webhook */
    webhookUrl: string;
    apiBaseUrl: string;
    /** Order status IDs treated as "not yet fulfilled". Shoptet system statuses: -1 new, -2 in progress. */
    openStatusIds: number[];
    /** Install callbacks come only from this range (Shoptet docs). Empty = do not check (local testing). */
    installIpPrefixes: string[];
}

export function shoptetConfigFromEnv(env: Readonly<Record<string, unknown>>): ShoptetConfig | undefined {
    const s = (k: string) => (typeof env[k] === 'string' && (env[k] as string).trim() !== '' ? (env[k] as string).trim() : undefined);
    const clientId = s('SHOPTET_CLIENT_ID');
    const oauthTokenUrl = s('SHOPTET_OAUTH_TOKEN_URL');
    const accessTokenUrl = s('SHOPTET_ACCESS_TOKEN_URL');
    const redirectUri = s('SHOPTET_REDIRECT_URI');
    const webhookUrl = s('SHOPTET_WEBHOOK_URL');
    if (!clientId || !oauthTokenUrl || !accessTokenUrl || !redirectUri || !webhookUrl) return undefined;
    for (const url of [oauthTokenUrl, accessTokenUrl, redirectUri, webhookUrl]) {
        if (!url.startsWith('https://')) throw new Error(`Shoptet config: ${url} must use https`);
    }
    const clientSecret = s('SHOPTET_CLIENT_SECRET');
    const openStatusIds = (s('SHOPTET_OPEN_STATUS_IDS') ?? '-1,-2').split(',').map((x) => Number(x.trim()));
    if (!openStatusIds.every(Number.isInteger)) throw new Error('SHOPTET_OPEN_STATUS_IDS must be comma separated integers');
    return {
        clientId, oauthTokenUrl, accessTokenUrl, redirectUri, webhookUrl, openStatusIds,
        ...(clientSecret ? { clientSecret } : {}),
        apiBaseUrl: s('SHOPTET_API_BASE_URL') ?? 'https://api.myshoptet.com',
        installIpPrefixes: s('SHOPTET_SKIP_INSTALL_IP_CHECK') === 'true' ? [] : ['185.184.254.'],
    };
}
