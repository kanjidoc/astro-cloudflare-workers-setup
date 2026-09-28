// Endpoint logic, kept out of src/pages so node:test can run it without `cloudflare:workers`.
// Each route file reads `env`, builds the config with authConfig() and calls one of these.
// Logs carry outcome codes and user names only: never tokens, cookies, bodies or IPs.
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import type { User } from '../../data/auth.ts';
import { openChallenge, sealChallenge } from './challenge.ts';
import { CHALLENGE_TTL_S, type AuthConfig } from './config.ts';
import {
  CHALLENGE_COOKIE,
  arrivalCookie,
  challengeCookie,
  clearChallengeCookie,
  clearSessionCookie,
  readCookie,
} from './cookies.ts';
import { sha256Hex } from './crypto.ts';
import { b64url } from './encoding.ts';
import {
  json,
  rateLimit,
  readJson,
  requireJson,
  requireSameOrigin,
  withCookies,
} from './http.ts';
import { createSession, resolveSession, sessionMeta } from './session.ts';
import {
  deleteInvite,
  deleteSession,
  getCredential,
  getInvite,
  getUser,
  putCredential,
  type InviteRecord,
} from './store.ts';
import { authOptions, regOptions, verifyAuth, verifyReg } from './webauthn.ts';

// Capped at 500, not the WebAuthn spec's 1023: the KV key is `cred:${id}` and KV keys cap at
// 512 bytes, so anything longer could never be stored and would otherwise 5xx deep in the KV call.
const CREDENTIAL_ID = /^[A-Za-z0-9_-]{1,500}$/;

/** GET /auth/session: who am I (used after a bfcache restore). */
export async function sessionInfo(
  request: Request,
  cfg: AuthConfig,
): Promise<Response> {
  const session = await resolveSession(request, cfg.kv);
  return session ? json({ user: session.user }) : json({ ok: false }, 401);
}

/** POST /auth/signin/options → 200 { options } + signed challenge cookie. */
export async function signinOptions(
  request: Request,
  cfg: AuthConfig,
  now = Date.now(),
): Promise<Response> {
  const blocked =
    requireSameOrigin(request, cfg.origin) ??
    requireJson(request) ??
    (await rateLimit(cfg.limiter, request, 'signin'));
  if (blocked) return blocked;
  const options = await authOptions(cfg);
  const sealed = await sealChallenge(cfg.cookieSecret, {
    c: options.challenge,
    p: 'auth',
    exp: now + CHALLENGE_TTL_S * 1000,
  });
  return withCookies(json({ options }), [challengeCookie(sealed)]);
}

function isAuthenticationResponse(
  body: unknown,
): body is AuthenticationResponseJSON {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.id === 'string' &&
    CREDENTIAL_ID.test(b.id) &&
    b.type === 'public-key' &&
    !!b.response &&
    typeof b.response === 'object'
  );
}

/** POST /auth/signin/verify → 200 { ok, user } + session and arrival cookies, or 401 { ok: false }. */
export async function signinVerify(
  request: Request,
  cfg: AuthConfig,
  now = Date.now(),
): Promise<Response> {
  const blocked =
    requireSameOrigin(request, cfg.origin) ??
    requireJson(request) ??
    (await rateLimit(cfg.limiter, request, 'signin'));
  if (blocked) return blocked;

  const fail = (reason: string) => {
    console.log(`auth: signin failed (${reason})`);
    return withCookies(json({ ok: false }, 401), [clearChallengeCookie()]);
  };
  const body = await readJson(request);
  if (!isAuthenticationResponse(body)) return fail('malformed');
  const challenge = await openChallenge(
    cfg.cookieSecret,
    readCookie(request, CHALLENGE_COOKIE),
    now,
    'auth',
  );
  if (!challenge) return fail('challenge');
  const cred = await getCredential(cfg.kv, body.id);
  if (!cred) return fail('unknown-credential');
  if (body.response.userHandle !== cred.webauthnUserID)
    return fail('user-handle');

  let result: VerifiedAuthenticationResponse;
  try {
    result = await verifyAuth(cfg, body, challenge.c, cred);
  } catch {
    return fail('assertion');
  }
  if (!result.verified) return fail('assertion');

  const counter = result.authenticationInfo.newCounter;
  await putCredential(cfg.kv, body.id, { ...cred, counter, lastUsedAt: now });
  const session = await createSession(
    cfg.kv,
    cred.user,
    body.id,
    sessionMeta(request),
    now,
  );
  console.log(`auth: signin ok (${cred.user})`);
  return withCookies(json({ ok: true, user: cred.user }), [
    session,
    clearChallengeCookie(),
    arrivalCookie('lock'),
  ]);
}

const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The unused, unexpired invite behind `token`, or null. Never consumes it (safe for link unfurlers). */
export async function inviteLookup(
  cfg: AuthConfig,
  token: string,
  now = Date.now(),
): Promise<(InviteRecord & { tokenHash: string }) | null> {
  if (!INVITE_TOKEN.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const invite = await getInvite(cfg.kv, tokenHash, now);
  return invite ? { ...invite, tokenHash } : null;
}

function tokenFrom(body: unknown): string {
  const token = (body as { token?: unknown } | null)?.token;
  return typeof token === 'string' ? token : '';
}

/** POST /auth/invite/options { token } → 200 { options } + challenge cookie, or 410. */
export async function inviteOptions(
  request: Request,
  cfg: AuthConfig,
  now = Date.now(),
): Promise<Response> {
  const blocked =
    requireSameOrigin(request, cfg.origin) ??
    requireJson(request) ??
    (await rateLimit(cfg.limiter, request, 'invite'));
  if (blocked) return blocked;
  const invite = await inviteLookup(
    cfg,
    tokenFrom(await readJson(request)),
    now,
  );
  const user = invite ? await getUser(cfg.kv, invite.user) : null;
  if (!invite || !user) return json({ ok: false }, 410);
  const options = await regOptions(cfg, user);
  const sealed = await sealChallenge(cfg.cookieSecret, {
    c: options.challenge,
    p: 'reg',
    i: invite.tokenHash,
    u: invite.user,
    exp: now + CHALLENGE_TTL_S * 1000,
  });
  return withCookies(json({ options }), [challengeCookie(sealed)]);
}

function isRegistrationResponse(
  body: unknown,
): body is RegistrationResponseJSON {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.id === 'string' &&
    CREDENTIAL_ID.test(b.id) &&
    b.type === 'public-key' &&
    !!b.response &&
    typeof b.response === 'object'
  );
}

/**
 * POST /auth/invite/verify { token, response } → 200 { ok, user } + session and arrival cookies.
 * Stores the passkey and consumes the invite. 410 when the invite is gone, 401 otherwise.
 */
export async function inviteVerify(
  request: Request,
  cfg: AuthConfig,
  now = Date.now(),
): Promise<Response> {
  const blocked =
    requireSameOrigin(request, cfg.origin) ??
    requireJson(request) ??
    (await rateLimit(cfg.limiter, request, 'invite'));
  if (blocked) return blocked;

  const fail = (reason: string, status = 401) => {
    console.log(`auth: invite failed (${reason})`);
    return withCookies(json({ ok: false }, status), [clearChallengeCookie()]);
  };
  const body = (await readJson(request)) as {
    token?: unknown;
    response?: unknown;
  } | null;
  const response = body?.response;
  if (!isRegistrationResponse(response)) return fail('malformed');
  const challenge = await openChallenge(
    cfg.cookieSecret,
    readCookie(request, CHALLENGE_COOKIE),
    now,
    'reg',
  );
  if (!challenge) return fail('challenge');
  const invite = await inviteLookup(cfg, tokenFrom(body), now);
  if (!invite) return fail('invite-gone', 410);
  if (invite.tokenHash !== challenge.i || invite.user !== challenge.u)
    return fail('invite-mismatch');
  const user = await getUser(cfg.kv, invite.user);
  if (!user) return fail('invite-gone', 410);

  let result: VerifiedRegistrationResponse;
  try {
    result = await verifyReg(cfg, response, challenge.c);
  } catch {
    return fail('attestation');
  }
  if (!result.verified) return fail('attestation');
  const info = result.registrationInfo;

  // registrationInfo.credential.id comes from the attestation's authData, parsed independently
  // of the outer response.id/rawId (SimpleWebAuthn only checks id === rawId, never against
  // authData) — with 'none' attestation there's no signature tying the two together, so a
  // forged or oversize authData credential id must be caught here before it ever reaches KV.
  if (
    !CREDENTIAL_ID.test(info.credential.id) ||
    info.credential.id !== response.id
  ) {
    return fail('malformed');
  }

  // WebAuthn L3 §7.1: never let a second registration under the same credential id overwrite
  // an existing one. Checked before anything is written, so the invite stays usable on refusal.
  if (await getCredential(cfg.kv, info.credential.id)) return fail('duplicate');

  const name: User = invite.user;
  // Delete the invite before storing the credential: losing an invite is recoverable (a new one
  // can be issued), but a live invite behind an already-stored credential is not.
  await deleteInvite(cfg.kv, invite.tokenHash);
  await putCredential(cfg.kv, info.credential.id, {
    user: name,
    webauthnUserID: user.webauthnUserID,
    publicKey: b64url.encode(info.credential.publicKey),
    counter: info.credential.counter,
    transports: info.credential.transports ?? [],
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    aaguid: info.aaguid,
    createdAt: now,
    lastUsedAt: now,
  });
  const session = await createSession(
    cfg.kv,
    name,
    info.credential.id,
    sessionMeta(request),
    now,
  );
  console.log(`auth: invite used (${name})`);
  return withCookies(json({ ok: true, user: name }), [
    session,
    clearChallengeCookie(),
    arrivalCookie('invite'),
  ]);
}

/**
 * POST /auth/signout → 204. Revokes this device's session only, clears the cookie and asks the
 * browser to drop cached gated responses.
 */
export async function signout(
  request: Request,
  cfg: AuthConfig,
): Promise<Response> {
  const blocked =
    requireSameOrigin(request, cfg.origin) ?? requireJson(request);
  if (blocked) return blocked;
  const session = await resolveSession(request, cfg.kv);
  if (session) await deleteSession(cfg.kv, session.keyHash);
  const res = new Response(null, {
    status: 204,
    headers: { 'Clear-Site-Data': '"cache"', 'Cache-Control': 'no-store' },
  });
  return withCookies(res, [clearSessionCookie()]);
}
