import type { IntegrationMode } from '../core/platform/PlatformAdapter.js';
export type { IntegrationMode };

export interface TenantConfig {
    tenantId: string;
    /** Adapter key; the core intentionally does not constrain this to Shoptet. */
    platform: string;
    integrationMode: IntegrationMode;
    enabled: boolean;
    // For a real app, API URLs, tokens, export FTP endpoints etc. would go here
}
