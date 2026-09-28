// Menu "sign out" (technical spec §5.4). Delegated, so it works whenever the visual layer
// renders the [data-auth-action="signout"] button.
import { readyToLeave, setAuthState, type AuthState } from './hooks.ts';

export interface SignOutDeps {
  /** POST /auth/signout. */
  post: () => Promise<Response>;
  /** location.replace('/'): only called after a 204. */
  navigate: () => void;
  setState: (state: AuthState) => void;
  /** The visual layer's optional fade. */
  readyToLeave: () => Promise<void>;
}

/**
 * Pure sign-out mechanics: a failed sign-out must never look successful. Only a 204 navigates
 * away; any other status or a network error un-fades the visual layer back to idle in place.
 */
export async function signOut(deps: SignOutDeps): Promise<void> {
  deps.setState('signing-out');
  await deps.readyToLeave().catch(() => undefined);
  let ok: boolean;
  try {
    const res = await deps.post();
    ok = res.status === 204;
  } catch {
    ok = false;
  }
  if (ok) {
    // replace: Back never returns to the private page. The Worker serves the lock page at /.
    deps.navigate();
  } else {
    deps.setState('idle');
  }
}

let leaving = false;

function post(): Promise<Response> {
  return fetch('/auth/signout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    credentials: 'same-origin',
    // Never leave the faded page hanging: a stalled request counts as a failed sign-out.
    signal: AbortSignal.timeout(8000),
  });
}

async function domSignOut(): Promise<void> {
  if (leaving) return;
  leaving = true;
  try {
    await signOut({
      post,
      navigate: () => location.replace('/'),
      setState: setAuthState,
      readyToLeave,
    });
  } finally {
    leaving = false;
  }
}

// Guarded so this module can be imported by node:test (for the pure signOut above) without a
// DOM. Always true in the browser, where Layout.astro imports this file for its side effect.
if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('[data-auth-action="signout"]')) return;
    event.preventDefault();
    void domSignOut();
  });
}
