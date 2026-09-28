// Pure sign-out mechanics extracted from src/scripts/signout.ts (technical fix wave item 3).
// A failed sign-out must never look successful: only a 204 navigates away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signOut, type SignOutDeps } from '../../src/scripts/signout.ts';

function harness(overrides: Partial<SignOutDeps> = {}) {
  const calls = { navigate: 0 };
  const states: string[] = [];
  const deps: SignOutDeps = {
    post: async () => new Response(null, { status: 204 }),
    navigate: () => {
      calls.navigate++;
    },
    setState: (state) => {
      states.push(state);
    },
    readyToLeave: async () => undefined,
    ...overrides,
  };
  return { deps, calls, states };
}

test('a 204 navigates away, after signalling signing-out', async () => {
  const h = harness();
  await signOut(h.deps);
  assert.deepEqual(h.states, ['signing-out']);
  assert.equal(h.calls.navigate, 1);
});

test('a 500 does not navigate and resets the visual state to idle', async () => {
  const h = harness({ post: async () => new Response(null, { status: 500 }) });
  await signOut(h.deps);
  assert.deepEqual(h.states, ['signing-out', 'idle']);
  assert.equal(h.calls.navigate, 0);
});

test('a thrown network error does not navigate and resets to idle', async () => {
  const h = harness({
    post: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  await signOut(h.deps);
  assert.deepEqual(h.states, ['signing-out', 'idle']);
  assert.equal(h.calls.navigate, 0);
});

test('any non-204 (e.g. 401) does not navigate and resets to idle', async () => {
  const h = harness({ post: async () => new Response(null, { status: 401 }) });
  await signOut(h.deps);
  assert.deepEqual(h.states, ['signing-out', 'idle']);
  assert.equal(h.calls.navigate, 0);
});

test('waits for readyToLeave before posting', async () => {
  const order: string[] = [];
  const h = harness({
    readyToLeave: async () => {
      order.push('ready');
    },
    post: async () => {
      order.push('post');
      return new Response(null, { status: 204 });
    },
  });
  await signOut(h.deps);
  assert.deepEqual(order, ['ready', 'post']);
});
