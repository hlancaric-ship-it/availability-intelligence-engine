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

const GA4_MEASUREMENT_ID = 'G-ERVNKX76VF';

const GA4_SNIPPET = `
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA4_MEASUREMENT_ID}');
</script>
`;

// Security headers applied to every response. GA4 + Google Fonts are allow-listed because the
// pages currently load them. 'unsafe-inline' in script-src is required by the inline gtag snippet and the
// inline onclick handlers in nexustp/dashboard.js – remove it once those are migrated to addEventListener.
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://www.googletagmanager.com https://*.google-analytics.com",
    "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
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

class HeadInjector {
  private snippet: string;
  private injected = false;

  constructor(snippet: string) {
    this.snippet = snippet;
  }

  element(element: Element) {
    if (this.injected) return;
    this.injected = true;
    element.prepend(this.snippet, { html: true });
  }
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

    const response = await env.ASSETS.fetch(request);

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return response;

    return new HTMLRewriter()
      .on('head', new HeadInjector(GA4_SNIPPET))
      .transform(response);
}
