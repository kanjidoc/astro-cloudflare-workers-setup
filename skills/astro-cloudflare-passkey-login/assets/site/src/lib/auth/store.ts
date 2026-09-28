// Typed access to the AUTH_KV namespace. The only module that knows key names (technical spec §4).
// Every value is JSON; a short summary is also stored as KV metadata so `wrangler kv key list`
// shows everything in one call. Raw tokens are never stored, only their SHA-256.
import type { User } from '../../data/auth.ts';
import { isUser } from '../../data/auth.ts';
import { SESSION_TTL_S, type KVLike } from './config.ts';

export interface UserRecord {
  name: User;
  /** 32 random bytes, base64url. Stable forever; it's the WebAuthn user handle. */
  webauthnUserID: string;
}

export interface InviteRecord {
  user: User;
  createdAt: number;
  expiresAt: number;
}

export interface CredentialRecord {
  user: User;
  webauthnUserID: string;
  /** COSE public key, base64url. */
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  aaguid: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface SessionRecord {
  user: User;
  credentialId: string;
  createdAt: number;
  /** User-Agent, at most 120 characters. */
  ua: string;
  country: string;
}

export const keys = {
  user: (name: User) => `user:${name}`,
  invite: (tokenHash: string) => `invite:${tokenHash}`,
  credential: (credentialId: string) => `cred:${credentialId}`,
  session: (tokenHash: string) => `session:${tokenHash}`,
};

async function getJson<T>(kv: KVLike, key: string): Promise<T | null> {
  const value = (await kv.get(key, 'json')) as T | null;
  if (!value || typeof value !== 'object') return null;
  return value;
}

export async function getUser(
  kv: KVLike,
  name: User,
): Promise<UserRecord | null> {
  const record = await getJson<UserRecord>(kv, keys.user(name));
  return record && isUser(record.name) ? record : null;
}

export async function getInvite(
  kv: KVLike,
  tokenHash: string,
  now: number,
): Promise<InviteRecord | null> {
  const record = await getJson<InviteRecord>(kv, keys.invite(tokenHash));
  if (!record || !isUser(record.user) || record.expiresAt <= now) return null;
  return record;
}

export async function deleteInvite(
  kv: KVLike,
  tokenHash: string,
): Promise<void> {
  await kv.delete(keys.invite(tokenHash));
}

export async function getCredential(
  kv: KVLike,
  credentialId: string,
): Promise<CredentialRecord | null> {
  const record = await getJson<CredentialRecord>(
    kv,
    keys.credential(credentialId),
  );
  return record && isUser(record.user) ? record : null;
}

export async function putCredential(
  kv: KVLike,
  credentialId: string,
  record: CredentialRecord,
): Promise<void> {
  await kv.put(keys.credential(credentialId), JSON.stringify(record), {
    metadata: {
      user: record.user,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
      aaguid: record.aaguid,
    },
  });
}

export async function getSession(
  kv: KVLike,
  tokenHash: string,
): Promise<SessionRecord | null> {
  const record = await getJson<SessionRecord>(kv, keys.session(tokenHash));
  return record && isUser(record.user) ? record : null;
}

export async function putSession(
  kv: KVLike,
  tokenHash: string,
  record: SessionRecord,
): Promise<void> {
  await kv.put(keys.session(tokenHash), JSON.stringify(record), {
    expirationTtl: SESSION_TTL_S,
    metadata: {
      user: record.user,
      credentialId: record.credentialId,
      createdAt: record.createdAt,
      ua: record.ua,
      country: record.country,
    },
  });
}

export async function deleteSession(
  kv: KVLike,
  tokenHash: string,
): Promise<void> {
  await kv.delete(keys.session(tokenHash));
}
