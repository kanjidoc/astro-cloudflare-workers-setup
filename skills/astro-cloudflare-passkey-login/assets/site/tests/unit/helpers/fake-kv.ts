// In-memory stand-in for the KVNamespace subset in src/lib/auth/config.ts (KVLike).
import type { KVLike } from '../../../src/lib/auth/config.ts';

export interface FakeEntry {
  value: string;
  expirationTtl?: number;
  metadata?: Record<string, unknown>;
}

export class FakeKV implements KVLike {
  readonly entries = new Map<string, FakeEntry>();
  writes = 0;

  async get(key: string, _type: 'json'): Promise<unknown> {
    const entry = this.entries.get(key);
    return entry ? JSON.parse(entry.value) : null;
  }

  async put(
    key: string,
    value: string,
    options: {
      expirationTtl?: number;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    this.writes++;
    this.entries.set(key, { value, ...options });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  json(key: string): unknown {
    const entry = this.entries.get(key);
    return entry ? JSON.parse(entry.value) : undefined;
  }

  keysWithPrefix(prefix: string): string[] {
    return [...this.entries.keys()].filter((key) => key.startsWith(prefix));
  }
}
