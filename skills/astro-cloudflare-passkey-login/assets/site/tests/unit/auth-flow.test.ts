import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPTIONS_STALE_MS,
  VERIFY_TIMEOUT_MS,
  createAuthFlow,
  type AuthFlowDeps,
  type FlowState,
} from '../../src/scripts/auth-flow.ts';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const options = (status = 200) =>
  Response.json({ options: { challenge: 'c' } }, { status });

function harness(overrides: Partial<AuthFlowDeps> = {}) {
  const log: string[] = [];
  const transitions: [FlowState, FlowState][] = [];
  let clock = 1_000;
  let timeoutSignal = new AbortController();
  const calls = { options: 0, ceremony: 0, verify: 0, navigate: 0, reload: 0 };
  const flow = createAuthFlow({
    fetchOptions: async () => {
      calls.options++;
      return options();
    },
    startCeremony: async () => {
      calls.ceremony++;
      return { id: 'assertion' };
    },
    verify: async () => {
      calls.verify++;
      return Response.json({ ok: true, user: 'someone' });
    },
    readyForSuccess: async () => {
      log.push('ready');
    },
    onState: (from, to) => {
      transitions.push([from, to]);
      log.push(to);
    },
    navigate: () => {
      calls.navigate++;
      log.push('navigate');
    },
    reload: () => {
      calls.reload++;
    },
    now: () => clock,
    timeout: () => {
      timeoutSignal = new AbortController();
      return timeoutSignal.signal;
    },
    ...overrides,
  });
  return {
    flow,
    log,
    transitions,
    calls,
    advance: (ms: number) => {
      clock += ms;
    },
    fireTimeout: () =>
      timeoutSignal.abort(new DOMException('timed out', 'TimeoutError')),
  };
}

async function settle() {
  for (let i = 0; i < 10; i++) await tick();
}

test('happy path: prompting → verifying → success, then navigate', async () => {
  const h = harness();
  await h.flow.prefetch();
  h.flow.tap();
  await settle();
  assert.deepEqual(h.log, [
    'prompting',
    'verifying',
    'ready',
    'success',
    'navigate',
  ]);
  assert.deepEqual(h.transitions[0], ['idle', 'prompting']);
});

test('with fresh options the ceremony starts synchronously inside the tap', async () => {
  const h = harness();
  await h.flow.prefetch();
  h.flow.tap();
  assert.equal(
    h.calls.ceremony,
    1,
    'no await between the click and startCeremony',
  );
});

test('double tap and rapid taps start exactly one ceremony', async () => {
  const ceremony = deferred<unknown>();
  let ceremonies = 0;
  const h = harness({
    startCeremony: () => {
      ceremonies++;
      return ceremony.promise;
    },
  });
  await h.flow.prefetch();
  for (let i = 0; i < 5; i++) h.flow.tap();
  ceremony.resolve({ id: 'assertion' });
  await tick();
  h.flow.tap();
  h.flow.tap();
  await settle();
  assert.equal(ceremonies, 1);
  assert.equal(h.calls.verify, 1);
  assert.equal(h.flow.state, 'success');
});

test('taps are ignored while verifying', async () => {
  const verify = deferred<Response>();
  const h = harness({ verify: () => verify.promise });
  await h.flow.prefetch();
  h.flow.tap();
  await settle();
  assert.equal(h.flow.state, 'verifying');
  h.flow.tap();
  assert.equal(h.calls.ceremony, 1);
  verify.resolve(Response.json({ ok: true }));
  await settle();
  assert.equal(h.flow.state, 'success');
});

test('slow verification: stays verifying until the server answers, then succeeds', async () => {
  const verify = deferred<Response>();
  const h = harness({ verify: () => verify.promise });
  await h.flow.prefetch();
  h.flow.tap();
  await settle();
  h.advance(3_000);
  await settle();
  assert.equal(h.flow.state, 'verifying');
  assert.equal(h.calls.navigate, 0);
  verify.resolve(Response.json({ ok: true, user: 'someone' }));
  await settle();
  assert.equal(h.flow.state, 'success');
  assert.equal(h.calls.navigate, 1);
});

test('success waits for readyForSuccess', async () => {
  const ready = deferred<void>();
  const h = harness({ readyForSuccess: () => ready.promise });
  await h.flow.prefetch();
  h.flow.tap();
  await settle();
  assert.equal(h.flow.state, 'verifying', 'the 200 alone is not enough');
  ready.resolve();
  await settle();
  assert.equal(h.flow.state, 'success');
  assert.equal(h.calls.navigate, 1);
});

test('a cancelled or timed-out prompt goes straight back to idle, silently', async () => {
  for (const err of [
    Object.assign(new Error('x'), { name: 'NotAllowedError' }),
    Object.assign(new Error('x'), { name: 'AbortError' }),
    Object.assign(new Error('x'), { code: 'ERROR_CEREMONY_ABORTED' }),
  ]) {
    const h = harness({
      startCeremony: async () => {
        throw err;
      },
    });
    await h.flow.prefetch();
    h.flow.tap();
    await settle();
    assert.deepEqual(h.log, ['prompting', 'idle']);
  }
});

test('other ceremony errors are a failure', async () => {
  const h = harness({
    startCeremony: async () => {
      throw Object.assign(new Error('x'), { name: 'SecurityError' });
    },
  });
  await h.flow.prefetch();
  h.flow.tap();
  await settle();
  assert.equal(h.flow.state, 'failure');
});

test('401, 429, 503, a network error and the 20 s timeout are all failures', async () => {
  const outcomes: (() => Promise<Response>)[] = [
    async () => Response.json({ ok: false }, { status: 401 }),
    async () => Response.json({ ok: false }, { status: 429 }),
    async () => Response.json({ ok: false }, { status: 503 }),
    async () => {
      throw new TypeError('Failed to fetch');
    },
  ];
  for (const verify of outcomes) {
    const h = harness({ verify });
    await h.flow.prefetch();
    h.flow.tap();
    await settle();
    assert.equal(h.flow.state, 'failure');
    assert.equal(h.calls.navigate, 0);
  }

  let timeoutMs = 0;
  const t = harness({
    timeout: (ms) => {
      timeoutMs = ms;
      const controller = new AbortController();
      queueMicrotask(() =>
        controller.abort(new DOMException('timed out', 'TimeoutError')),
      );
      return controller.signal;
    },
    verify: (_result, signal) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason)),
      ),
  });
  await t.flow.prefetch();
  t.flow.tap();
  await settle();
  assert.equal(timeoutMs, VERIFY_TIMEOUT_MS);
  assert.equal(t.flow.state, 'failure');
});

test('failure → the next tap goes through idle and starts fresh', async () => {
  let attempt = 0;
  const h = harness({
    verify: async () => {
      attempt++;
      return attempt === 1
        ? Response.json({ ok: false }, { status: 401 })
        : Response.json({ ok: true });
    },
  });
  await h.flow.prefetch();
  h.flow.tap();
  await settle();
  assert.equal(h.flow.state, 'failure');
  h.flow.tap();
  await settle();
  assert.deepEqual(h.log, [
    'prompting',
    'verifying',
    'failure',
    'idle',
    'prompting',
    'verifying',
    'ready',
    'success',
    'navigate',
  ]);
  assert.equal(
    h.calls.options,
    2,
    'options refetched after the failed attempt',
  );
});

test('options are used once and refetched when stale', async () => {
  const h = harness();
  await h.flow.prefetch();
  assert.equal(h.calls.options, 1);
  h.advance(OPTIONS_STALE_MS - 1);
  h.flow.refreshIfStale();
  await settle();
  assert.equal(h.calls.options, 1, 'still fresh');
  h.advance(1);
  h.flow.refreshIfStale();
  await settle();
  assert.equal(h.calls.options, 2, 'stale → refetched');

  h.advance(OPTIONS_STALE_MS);
  h.flow.tap();
  assert.equal(
    h.calls.ceremony,
    0,
    'stale options are never used; the tap fetches first',
  );
  await settle();
  assert.equal(h.calls.options, 3);
  assert.equal(h.calls.ceremony, 1);
});

test('a visibility or focus event refetches options even when they are not stale', async () => {
  const h = harness();
  await h.flow.prefetch();
  assert.equal(h.calls.options, 1);

  // Fresh options (a stale check would skip a refetch here), but another tab may have already
  // overwritten the shared challenge cookie, so refresh() must not trust the cache's age.
  h.flow.refresh();
  await settle();
  assert.equal(
    h.calls.options,
    2,
    'refetched on a visibility event, fresh or not',
  );

  h.flow.refresh();
  await settle();
  assert.equal(
    h.calls.options,
    3,
    'refetched again on a focus event, fresh or not',
  );
});

test('a bfcache restore (pageshow persisted) resets to idle with fresh options', async () => {
  const verify = deferred<Response>();
  const h = harness({ verify: () => verify.promise });
  await h.flow.prefetch();
  h.flow.tap();
  await settle();
  assert.equal(h.flow.state, 'verifying');
  h.flow.reset();
  await settle();
  assert.equal(h.flow.state, 'idle');
  assert.equal(h.calls.options, 2);
});

test('an invite that is gone (410) reloads the page', async () => {
  const h = harness({ fetchOptions: async () => options(410) });
  await h.flow.prefetch();
  assert.equal(h.calls.reload, 1);
  const v = harness({
    verify: async () => Response.json({ ok: false }, { status: 410 }),
  });
  await v.flow.prefetch();
  v.flow.tap();
  await settle();
  assert.equal(v.calls.reload, 1);
  assert.equal(v.calls.navigate, 0);
});

test('a 410 fetching fresh options mid-tap reloads and returns, never reaching failure', async () => {
  // Seed the cache with fresh options, then let them go stale so the tap is forced to fetch
  // options directly inside run() (the same path takeFresh() would otherwise skip).
  let call = 0;
  const h = harness({
    fetchOptions: async () => {
      call++;
      return call === 1 ? options(200) : options(410);
    },
  });
  await h.flow.prefetch();
  assert.equal(call, 1);
  h.advance(OPTIONS_STALE_MS);
  h.flow.tap();
  await settle();
  assert.equal(call, 2);
  assert.equal(h.calls.reload, 1);
  assert.equal(
    h.calls.ceremony,
    0,
    'never started a ceremony with gone options',
  );
  assert.ok(
    !h.log.includes('failure'),
    'a 410 must reload in place, exactly like the verify path, never falling through to failure',
  );
});
