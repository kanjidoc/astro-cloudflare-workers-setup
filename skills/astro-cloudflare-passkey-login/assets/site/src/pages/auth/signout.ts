import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { authConfig } from '../../lib/auth/config.ts';
import { signout } from '../../lib/auth/handlers.ts';
import { unavailable } from '../../lib/auth/http.ts';

export const prerender = false;

export const POST: APIRoute = ({ request }) => {
  const cfg = authConfig(env);
  return cfg ? signout(request, cfg) : unavailable();
};
