import { PlatformRegistry } from '../core/platform/PlatformAdapter.js';

/**
 * THE place where commerce platforms are plugged in. Example (TODO krok 4):
 *
 *   import { ShoptetPlatformAdapter } from './shoptet/ShoptetPlatformAdapter.js';
 *   platforms.register(new ShoptetPlatformAdapter({ clientId, clientSecret, ... }));
 *
 * Nothing else in the service needs to change for a new platform: install/uninstall, webhooks,
 * scheduled planning, payment checks and write-back are all routed through the adapter.
 */
export function createPlatformRegistry(_env: Readonly<Record<string, unknown>>): PlatformRegistry {
    const platforms = new PlatformRegistry();
    return platforms;
}
