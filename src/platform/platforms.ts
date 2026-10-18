import { PlatformRegistry } from '../core/platform/PlatformAdapter.js';
import type { LoggerPort } from '../core/procurement/ports.js';
import { shoptetConfigFromEnv } from './shoptet/ShoptetConfig.js';
import { ShoptetPlatformAdapter } from './shoptet/ShoptetPlatformAdapter.js';

const silent: LoggerPort = { info: () => undefined, warn: () => undefined, error: () => undefined };

/**
 * THE place where commerce platforms are plugged in. A new platform = one adapter + one `register` call;
 * install/uninstall, webhooks, scheduled planning, payment checks and warehouse sync are all generic.
 *
 * A platform is registered only when its configuration is complete – nothing runs half-configured.
 */
export function createPlatformRegistry(env: Readonly<Record<string, unknown>>, logger: LoggerPort = silent): PlatformRegistry {
    const platforms = new PlatformRegistry();

    const shoptet = shoptetConfigFromEnv(env);
    if (shoptet) platforms.register(new ShoptetPlatformAdapter(shoptet, logger));

    // Next platforms, e.g.:
    // const woo = wooConfigFromEnv(env); if (woo) platforms.register(new WooCommerceAdapter(woo, logger));

    return platforms;
}
