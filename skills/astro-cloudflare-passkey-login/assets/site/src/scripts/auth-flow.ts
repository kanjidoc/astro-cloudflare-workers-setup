// Client state machine shared by the lock screen and the invite screen (technical spec §6.1).
// createAuthFlow() is pure: every browser API arrives as a dependency, so node:test can drive it.
// mountAuthFlow() wires it to the page.
import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { readyForSuccess, setAuthState } from './hooks.ts';

export type FlowState =
  'idle' | 'prompting' | 'verifying' | 'success' | 'failure';
export type FlowKind = 'signin' | 'invite';

/** Options go stale after 4 minutes (the challenge cookie lives 5). */
export const OPTIONS_STALE_MS = 240_000;
/** The client gives up on verification after 20 s. */
export const VERIFY_TIMEOUT_MS = 20_000;

export interface AuthFlowDeps {
  /** POST …/options. */
  fetchOptions: () => Promise<Response>;
  /** startAuthentication / startRegistration with the options JSON. */
  startCeremony: (optionsJSON: unknown) => Promise<unknown>;
  /** POST …/verify with the ceremony result; `signal` aborts after VERIFY_TIMEOUT_MS. */
  verify: (result: unknown, signal: AbortSignal) => Promise<Response>;
  /** The visual layer's optional hook; `success` waits for it. */
  readyForSuccess: () => Promise<void>;
  onState: (from: FlowState, to: FlowState) => void;
  /** After success: location.replace(...). */
  navigate: () => void;
  /** An invite that's gone (410): reload to get the unavailable screen. */
  reload: () => void;
  now?: () => number;
  timeout?: (ms: number) => AbortSignal;
}

export interface AuthFlow {
  readonly state: FlowState;
  /** Fetch options ahead of the tap so the ceremony can start inside the click handler. */
  prefetch: () => Promise<void>;
  /** The unlock / save-my-passkey button. Ignored unless idle or failure. */
  tap: () => void;
  /** A bfcache restore: back to idle with fresh options. */
  reset: () => void;
  /** The tab became visible again: refetch options if they're stale. */
  refreshIfStale: () => void;
  /**
   * The tab became visible or focused again: refetch options unconditionally. Another tab's
   * ceremony can overwrite the single `__Host-auth-challenge` cookie underneath this tab's cached
   * options, so staleness alone isn't a reliable signal here.
   */
  refresh: () => void;
}

/** A dismissed or timed-out prompt. The contract treats both as a silent cancel. */
export function isCancel(err: unknown): boolean {
  const e = err as { code?: unknown; name?: unknown } | null;
  return (
    e?.code === 'ERROR_CEREMONY_ABORTED' ||
    e?.name === 'NotAllowedError' ||
    e?.name === 'AbortError'
  );
}

export function createAuthFlow(deps: AuthFlowDeps): AuthFlow {
  const now = deps.now ?? Date.now;
  const timeout = deps.timeout ?? ((ms: number) => AbortSignal.timeout(ms));
  let state: FlowState = 'idle';
  let cached: { json: unknown; at: number } | null = null;
  let inflight: Promise<void> | null = null;

  function set(to: FlowState): void {
    if (to === state) return;
    const from = state;
    state = to;
    deps.onState(from, to);
  }

  /** A 410 means the invite is gone: reload() has already been triggered. */
  class OptionsGone extends Error {}

  /** Options JSON, or null on a non-410 failure. Throws OptionsGone after reload() on a 410. */
  async function loadOptions(): Promise<unknown> {
    const res = await deps.fetchOptions();
    if (res.status === 410) {
      deps.reload();
      throw new OptionsGone();
    }
    if (!res.ok) return null;
    const body = (await res.json()) as { options?: unknown };
    return body.options ?? null;
  }

  function prefetch(): Promise<void> {
    inflight ??= loadOptions()
      .then(
        (json) => {
          cached = json ? { json, at: now() } : null;
        },
        () => {
          cached = null;
        },
      )
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  /** Fresh options, used once (the server clears the challenge on every verify). */
  function takeFresh(): unknown {
    const fresh =
      cached && now() - cached.at < OPTIONS_STALE_MS ? cached.json : null;
    cached = null;
    return fresh;
  }

  async function run(prefetched: unknown): Promise<void> {
    let optionsJSON = prefetched;
    if (!optionsJSON) {
      try {
        optionsJSON = await loadOptions();
      } catch (err) {
        // reload() already fired; don't also fall through to a failure state, exactly like the
        // verify path below (a gone invite is a reload, never a failure flash first).
        if (err instanceof OptionsGone) return;
        optionsJSON = null;
      }
      if (!optionsJSON) {
        set('failure');
        return;
      }
    }

    let result: unknown;
    try {
      result = await deps.startCeremony(optionsJSON);
    } catch (err) {
      set(isCancel(err) ? 'idle' : 'failure');
      void prefetch();
      return;
    }

    set('verifying');
    let ok = false;
    try {
      const res = await deps.verify(result, timeout(VERIFY_TIMEOUT_MS));
      if (res.status === 410) {
        deps.reload();
        return;
      }
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (!ok) {
      set('failure');
      void prefetch();
      return;
    }

    await deps.readyForSuccess().catch(() => undefined);
    set('success');
    deps.navigate();
  }

  return {
    get state() {
      return state;
    },
    prefetch,
    tap() {
      if (state !== 'idle' && state !== 'failure') return;
      if (state === 'failure') set('idle');
      set('prompting');
      // With fresh options this reaches startCeremony synchronously, inside the click
      // (Safari's user-activation rule).
      void run(takeFresh());
    },
    reset() {
      set('idle');
      cached = null;
      void prefetch();
    },
    refreshIfStale() {
      if (state !== 'idle' && state !== 'failure') return;
      if (!cached || now() - cached.at >= OPTIONS_STALE_MS) void prefetch();
    },
    refresh() {
      if (state !== 'idle' && state !== 'failure') return;
      void prefetch();
    },
  };
}

function postJson(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    signal,
  });
}

/** Wires the flow to the lock (`signin`) or invite page. No-op when the button isn't there. */
export function mountAuthFlow(kind: FlowKind): void {
  const action = kind === 'signin' ? 'unlock' : 'register';
  const button = document.querySelector<HTMLButtonElement>(
    `[data-auth-action="${action}"]`,
  );
  if (!button) return;
  const failure = document.querySelector<HTMLElement>('[data-part="failure"]');
  const base = kind === 'signin' ? '/auth/signin' : '/auth/invite';
  const token =
    kind === 'invite'
      ? decodeURIComponent(location.pathname.split('/')[2] ?? '')
      : '';

  const flow = createAuthFlow({
    fetchOptions: () =>
      postJson(`${base}/options`, kind === 'invite' ? { token } : {}),
    startCeremony: (optionsJSON) =>
      kind === 'signin'
        ? startAuthentication({
            optionsJSON: optionsJSON as PublicKeyCredentialRequestOptionsJSON,
          })
        : startRegistration({
            optionsJSON: optionsJSON as PublicKeyCredentialCreationOptionsJSON,
          }),
    verify: (result, signal) =>
      postJson(
        `${base}/verify`,
        kind === 'invite' ? { token, response: result } : result,
        signal,
      ),
    readyForSuccess,
    onState: (_from, to) => {
      if (failure) failure.hidden = to !== 'failure';
      setAuthState(to);
    },
    // Same URL without the #fragment (the lock page is served in place); invites land on /.
    navigate: () =>
      location.replace(
        kind === 'signin' ? location.pathname + location.search : '/',
      ),
    reload: () => location.reload(),
  });

  document.documentElement.dataset.authState = 'idle';
  button.addEventListener('click', () => flow.tap());
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) flow.reset();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flow.refresh();
  });
  window.addEventListener('focus', () => flow.refresh());
  void flow.prefetch();
}
