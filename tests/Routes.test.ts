import { describe, expect, test } from 'vitest';
import { redirectTarget } from '../src/platform/cloudflare/routes.js';

describe('Adresy: Chytrý nákupčí místo Nexus', () => {
    test.each([
        ['/nexus', '/chytry-nakupci/'],
        ['/nexus/', '/chytry-nakupci/'],
        ['/nexus/assets/fonts/plus-jakarta-sans.css', '/chytry-nakupci/assets/fonts/plus-jakarta-sans.css'],
        ['/nexus/dashboard.js', '/chytry-nakupci/demo/dashboard.js'],
        ['/nexustp', '/chytry-nakupci/demo/'],
        ['/nexustp/', '/chytry-nakupci/demo/'],
        ['/nexustp/styles.css', '/chytry-nakupci/demo/styles.css'],
        ['/availability', '/chytry-nakupci/demo/'],
        ['/availability/x', '/chytry-nakupci/demo/x'],
        ['/chytry-nakupci', '/chytry-nakupci/'],
        ['/chytry-nakupci/demo', '/chytry-nakupci/demo/'],
    ])('%s → %s', (from, to) => expect(redirectTarget(from)).toBe(to));

    test.each(['/chytry-nakupci/', '/chytry-nakupci/demo/', '/chytry-nakupci/demo/dashboard.js', '/nexusx', '/api/v1/dashboard', '/platforms/shoptet/webhook', '/'])(
        '%s se nepřesměrovává', (p) => expect(redirectTarget(p)).toBeUndefined());
});

describe('Web neobsahuje název Nexus', () => {
    test('žádný soubor ve frontend/ nezmiňuje Nexus', async () => {
        const { readdirSync, readFileSync, statSync } = await import('node:fs');
        const { join } = await import('node:path');
        const root = new URL('../frontend', import.meta.url).pathname;
        const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
        const offenders = walk(root).filter((f) => /\.(html|js|css|json|txt)$/.test(f) && /nexus/i.test(readFileSync(f, 'utf8')));
        expect(offenders).toEqual([]);
    });
});
