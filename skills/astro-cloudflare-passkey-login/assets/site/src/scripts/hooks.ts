// The only things the visual layer and the technical layer share in JavaScript (design
// overview → Hooks). The visual layer registers optional promises; the auth scripts await them.
// Kept on globalThis under a Symbol.for key so every bundle sees the same registry, even if a
// bundler ever duplicates this module.

export type AuthState =
  'idle' | 'prompting' | 'verifying' | 'success' | 'failure' | 'signing-out';

type Ready = () => Promise<void>;

interface Registry {
  success: Ready;
  leave: Ready;
}

const resolved: Ready = () => Promise.resolve();
const KEY = Symbol.for('passkey-login.hooks');

function registry(): Registry {
  const g = globalThis as typeof globalThis & { [KEY]?: Registry };
  g[KEY] ??= { success: resolved, leave: resolved };
  return g[KEY];
}

/** Visual layer: the lock/invite page waits for this before entering `success` and navigating. */
export function setReadyForSuccess(fn: Ready): void {
  registry().success = fn;
}

export function readyForSuccess(): Promise<void> {
  return registry().success();
}

/** Visual layer: sign-out waits for this (the fade) before navigating. */
export function setReadyToLeave(fn: Ready): void {
  registry().leave = fn;
}

export function readyToLeave(): Promise<void> {
  return registry().leave();
}

/**
 * Sets `<html data-auth-state>` and fires `auth:state` with `{ from, to }` on `document`.
 * No event when the state doesn't change.
 */
export function setAuthState(to: AuthState): void {
  const root = document.documentElement;
  const from = (root.dataset.authState ?? null) as AuthState | null;
  if (from === to) return;
  root.dataset.authState = to;
  document.dispatchEvent(
    new CustomEvent('auth:state', { detail: { from, to } }),
  );
}
