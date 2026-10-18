import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

// Extract the browser helpers from the shipped frontend and evaluate them in isolation.
const src = readFileSync(new URL('../frontend/chytry-nakupci/demo/dashboard.js', import.meta.url), 'utf8');
const helpers = src.slice(src.indexOf('function esc('), src.indexOf('\n}\n', src.indexOf('function jsArg(')) + 3);
const { esc, jsArg } = new Function(`${helpers}; return { esc, jsArg };`)() as { esc: (v: unknown) => string; jsArg: (v: unknown) => string };
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#96;/g, '`').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

describe('Frontend – ochrana proti XSS', () => {
    test('esc neutralizuje HTML', () => {
        expect(esc('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
        expect(esc('" onmouseover="x')).not.toContain('"');
        expect(esc(undefined)).toBe('');
    });
    test.each(["');alert(1);//", '");alert(1);//', '</script><script>alert(1)</script>', '\\\');alert(1)//'])(
        'jsArg v onclick nevytvoří spustitelný kód: %s', (payload) => {
            const attr = jsArg(payload);
            expect(attr).not.toMatch(/["'<>]/); // nemůže ukončit atribut
            // Po HTML dekódování prohlížečem musí jít o jediný JS string literal s původní hodnotou.
            expect(JSON.parse(decode(attr))).toBe(payload);
        });
    test('žádný inline handler nevkládá hodnotu do uvozovek ručně', () => {
        for (const f of ['../frontend/chytry-nakupci/demo/dashboard.js']) {
            const code = readFileSync(new URL(f, import.meta.url), 'utf8');
            expect(code.split('\n').filter((l) => l.includes('onclick=') && /'\$\{/.test(l))).toEqual([]);
        }
    });
});

describe('Veřejné assety', () => {
    test('ve složce frontend nejsou vývojářské skripty ani lokální cesty', async () => {
        const { readdirSync, statSync } = await import('node:fs');
        const root = new URL('../frontend/', import.meta.url);
        const walk = (dir: URL): string[] => readdirSync(dir).flatMap((n) => {
            const u = new URL(n, dir);
            return statSync(u).isDirectory() ? walk(new URL(`${n}/`, dir)) : [u.pathname];
        });
        for (const f of walk(root)) {
            expect(f).not.toMatch(/\.cjs$|update_/);
            expect(readFileSync(f, 'utf8')).not.toMatch(/\/Users\/|cistytriko|Florence/);
        }
    });
});
