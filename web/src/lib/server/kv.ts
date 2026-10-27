import "server-only";
import { Redis } from "@upstash/redis";
import { serverEnv } from "./env";

/**
 * Tiny key-value facade. Upstash Redis in production (shared across serverless instances); an in-process
 * map in development. Used for rate limits, tribunal locks and ruling idempotency.
 */
export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<boolean>;
  incr(key: string, ttlSeconds: number): Promise<number>;
  del(key: string): Promise<void>;
}

class MemoryKV implements KV {
  private data = new Map<string, { value: unknown; expires: number }>();

  private live(key: string) {
    const hit = this.data.get(key);
    if (hit && hit.expires && hit.expires < Date.now()) {
      this.data.delete(key);
      return undefined;
    }
    return hit;
  }

  async get<T>(key: string) {
    return (this.live(key)?.value as T) ?? null;
  }

  async set(key: string, value: unknown, opts: { ex?: number; nx?: boolean } = {}) {
    if (opts.nx && this.live(key)) return false;
    this.data.set(key, { value, expires: opts.ex ? Date.now() + opts.ex * 1000 : 0 });
    return true;
  }

  async incr(key: string, ttlSeconds: number) {
    const hit = this.live(key);
    const next = ((hit?.value as number) ?? 0) + 1;
    this.data.set(key, { value: next, expires: hit?.expires || Date.now() + ttlSeconds * 1000 });
    return next;
  }

  async del(key: string) {
    this.data.delete(key);
  }
}

class RedisKV implements KV {
  constructor(private redis: Redis) {}

  async get<T>(key: string) {
    return this.redis.get<T>(key);
  }

  async set(key: string, value: unknown, opts: { ex?: number; nx?: boolean } = {}) {
    const res = opts.nx
      ? opts.ex
        ? await this.redis.set(key, value, { nx: true, ex: opts.ex })
        : await this.redis.set(key, value, { nx: true })
      : opts.ex
        ? await this.redis.set(key, value, { ex: opts.ex })
        : await this.redis.set(key, value);
    return res === "OK";
  }

  async incr(key: string, ttlSeconds: number) {
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, ttlSeconds);
    return n;
  }

  async del(key: string) {
    await this.redis.del(key);
  }
}

const globalKV = globalThis as unknown as { __pactumKV?: KV };

export const kv: KV =
  globalKV.__pactumKV ??
  (globalKV.__pactumKV =
    serverEnv.redisUrl && serverEnv.redisToken
      ? new RedisKV(new Redis({ url: serverEnv.redisUrl, token: serverEnv.redisToken }))
      : new MemoryKV());

export const isDurableKV = () => Boolean(serverEnv.redisUrl && serverEnv.redisToken);
