interface Env {
  ASSETS: Fetcher;
}

const SANDBOX_PREFIX = '/nexustp';
const LEGACY_PREFIX = '/availability';

const OLD_SANDBOX_ASSETS = new Set([
  'dashboard.js',
  'app-shell.js',
  'ui-config.js',
  'styles.css',
]);

// Security headers applied to every response. No third-party scripts, fonts or analytics are loaded
// (backend add-on; no tracking → no cookie consent needed). 'unsafe-inline' in script-src is still required by the
// inline onclick handlers in nexustp/dashboard.js – remove it once those are migrated to addEventListener.
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(key, value);
  return secured;
}

function redirect(url: URL, pathname: string, status = 308): Response {
  url.pathname = pathname;
  return Response.redirect(url.toString(), status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSecurityHeaders(await route(request, env));
  },
};

async function route(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === LEGACY_PREFIX || pathname.startsWith(`${LEGACY_PREFIX}/`)) {
      const rest = pathname.slice(LEGACY_PREFIX.length) || '/';
      return redirect(url, `${SANDBOX_PREFIX}${rest}`);
    }

    if (pathname === SANDBOX_PREFIX) {
      return redirect(url, `${SANDBOX_PREFIX}/`);
    }

    if (pathname.startsWith('/nexus/')) {
      const rest = pathname.slice('/nexus/'.length);
      if (OLD_SANDBOX_ASSETS.has(rest)) {
        return redirect(url, `${SANDBOX_PREFIX}/${rest}`);
      }
    }

    return env.ASSETS.fetch(request);
}
