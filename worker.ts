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
  },
};
