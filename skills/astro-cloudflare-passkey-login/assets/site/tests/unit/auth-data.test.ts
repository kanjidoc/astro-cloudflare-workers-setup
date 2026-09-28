import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RP_NAME, USERS, authCopy, isUser, withName } from '../../src/data/auth.ts';

test('user names are lowercase [a-z0-9-], 1-32 chars, and there is at least one', () => {
  assert.ok(USERS.length >= 1);
  for (const name of USERS) assert.match(name, /^[a-z0-9-]{1,32}$/, name);
  assert.equal(new Set(USERS).size, USERS.length, 'names must be unique');
});

test('isUser accepts exactly the listed names', () => {
  for (const name of USERS) assert.equal(isUser(name), true, name);
  assert.equal(isUser(USERS[0].toUpperCase()), false);
  assert.equal(isUser('nobody-listed'), false);
  assert.equal(isUser(undefined), false);
});

test('the passkey prompt has a name and every copy string is filled', () => {
  assert.ok(RP_NAME.length > 0 && !RP_NAME.startsWith('<'));
  for (const [key, value] of Object.entries(authCopy)) {
    assert.ok(value.length > 0 && !value.includes('<'), key);
  }
  assert.equal(withName('Hi {name}', USERS[0]), `Hi ${USERS[0]}`);
});
