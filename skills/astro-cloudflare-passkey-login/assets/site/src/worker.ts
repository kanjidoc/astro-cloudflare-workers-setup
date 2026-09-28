// The gate (technical spec §2, §7). Runs before every request (assets.run_worker_first).
// Order: backup host → public allowlist → /auth/* and /invite/* → session → lock page or 401.
// Security headers go on every response it returns.
import { handle } from '@astrojs/cloudflare/handler';
import { authConfig } from './lib/auth/config.ts';
import {
  ARRIVAL_COOKIE,
  clearArrivalCookie,
  clearSessionCookie,
  readCookie,
} from './lib/auth/cookies.ts';
import {
  hasSessionCookie,
  resolveSession,
  type ResolvedSession,
} from './lib/auth/session.ts';
import { isPublicPath } from './lib/gate/allowlist.ts';
import { arrivalDecision } from './lib/gate/arrival.ts';
import { wantsDocument } from './lib/gate/classify.ts';
import {
  applyGatedCache,
  applyNoStore,
  applySecurityHeaders,
  isHtml,
} from './lib/gate/headers.ts';
import { backupRedirectTarget } from './lib/gate/redirect.ts';

const LOCK_PAGE = '/lock/';

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    let res: Response;
    try {
      res = await gate(request, env, ctx);
    } catch (err) {
      // Fail closed. Never log tokens, cookies, bodies or full request state — name/message only.
      console.error(
        'gate error',
        err instanceof Error ? err.name : typeof err,
        err instanceof Error ? err.message : '',
      );
      res = applyNoStore(new Response(null, { status: 503 }));
    }
    return applySecurityHeaders(
      res,
      pathname.startsWith('/invite/') ? { referrerPolicy: 'no-referrer' } : {},
    );
  },
} satisfies ExportedHandler<Env>;

async function gate(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const readOnly = request.method === 'GET' || request.method === 'HEAD';

  // 1. The workers.dev backup host can't use passkeys (they're bound to the apex).
  if (env.BACKUP_HOST && url.hostname === env.BACKUP_HOST) {
    return Response.redirect(
      backupRedirectTarget(env.ORIGIN, url.pathname, url.search),
      301,
    );
  }

  // 2. The public allowlist: the lock page's own styles, scripts, fonts and art.
  if (readOnly && isPublicPath(url.pathname)) return env.ASSETS.fetch(request);

  // 3. Auth endpoints and invite pages do their own checks.
  if (
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/invite/')
  ) {
    return handle(request, env, ctx);
  }

  // 4. Everything else needs a session.
  const cfg = authConfig(env);
  const session = cfg ? await resolveSession(request, cfg.kv) : null;
  if (session) return servePrivate(request, env, ctx, session);
  return serveLocked(request, env, readOnly);
}

async function servePrivate(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  session: ResolvedSession,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === LOCK_PAGE || pathname === '/lock') {
    return new Response(null, { status: 303, headers: { Location: '/' } });
  }
  const res = await handle(request, env, ctx);
  if (!isHtml(res)) return applyGatedCache(res, pathname);

  // Who's signed in (every gated HTML response), and — only for the GET document response that
  // actually renders the destination — the one-time arrival signal for the bloom.
  const arrival = readCookie(request, ARRIVAL_COOKIE);
  const decision = arrivalDecision(request, arrival);
  const attributes = {
    'data-user': session.user,
    ...decision.attributes,
  };
  const rewritten = new HTMLRewriter()
    .on('html', {
      element(el) {
        for (const [name, value] of Object.entries(attributes))
          el.setAttribute(name, value);
      },
    })
    .transform(res);
  const out = applyGatedCache(rewritten, pathname);
  if (decision.expire) out.headers.append('Set-Cookie', clearArrivalCookie());
  return out;
}

async function serveLocked(
  request: Request,
  env: Env,
  readOnly: boolean,
): Promise<Response> {
  let res: Response;
  if (readOnly && wantsDocument(request)) {
    // Served at the requested URL (no redirect). The trailing slash matters: /lock would 307.
    const lock = await env.ASSETS.fetch(
      new Request(new URL(LOCK_PAGE, request.url), { method: request.method }),
    );
    res = lock.ok
      ? new Response(lock.body, { status: 200, headers: lock.headers })
      : new Response(null, { status: 503 });
  } else {
    res = new Response(null, { status: 401 });
  }
  res = applyNoStore(res);
  // A cookie with no matching session (expired, revoked, signed out elsewhere) is cleared.
  if (hasSessionCookie(request))
    res.headers.append('Set-Cookie', clearSessionCookie());
  return res;
}
