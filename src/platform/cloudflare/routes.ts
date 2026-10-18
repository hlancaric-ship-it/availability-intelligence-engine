/** Public URLs of the product "L-Code Chytrý nákupčí". */
export const SITE_PREFIX = '/chytry-nakupci';
export const DEMO_PREFIX = `${SITE_PREFIX}/demo`;

const OLD_DEMO_ASSETS = new Set(['dashboard.js', 'app-shell.js', 'ui-config.js', 'styles.css']);

/** Old prefix → new prefix. Order matters: longer / more specific first. */
const LEGACY: ReadonlyArray<readonly [string, string]> = [
    ['/availability', DEMO_PREFIX],
    ['/nexustp', DEMO_PREFIX],
    ['/nexus', SITE_PREFIX],
];

function underPrefix(pathname: string, prefix: string): string | undefined {
    if (pathname === prefix) return '/';
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
    return undefined;
}

/**
 * Returns the new path for old URLs (permanent 308 redirect) or for directory URLs missing the trailing slash.
 * undefined = serve as is. Old links (/nexus, /nexustp, /availability) keep working forever.
 */
export function redirectTarget(pathname: string): string | undefined {
    for (const [oldPrefix, newPrefix] of LEGACY) {
        const rest = underPrefix(pathname, oldPrefix);
        if (rest === undefined) continue;
        // Very old builds loaded demo scripts from /nexus/<file>.
        if (oldPrefix === '/nexus' && OLD_DEMO_ASSETS.has(rest.slice(1))) return `${DEMO_PREFIX}${rest}`;
        return `${newPrefix}${rest}`;
    }
    if (pathname === SITE_PREFIX || pathname === DEMO_PREFIX) return `${pathname}/`;
    return undefined;
}
