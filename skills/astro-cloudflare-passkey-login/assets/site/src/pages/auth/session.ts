import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { authConfig } from '../../lib/auth/config.ts';
import { sessionInfo } from '../../lib/auth/handlers.ts';
import { unavailable } from '../../lib/auth/http.ts';

// On demand. Also keeps the build from going assets-only, which would drop src/worker.ts (F5).
export const prerender = false;

export const GET: APIRoute = ({ request }) => {
  const cfg = authConfig(env);
  return cfg ? sessionInfo(request, cfg) : unavailable();
};
