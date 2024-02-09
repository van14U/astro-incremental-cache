import { BaseCache } from "./base";
import { binding } from "cf-bindings-proxy";
import { parseCacheEntry, type CacheEntry, stringifyCacheEntry } from "./utils";

const kv = binding<KVNamespace>("KV_CACHE");

class KVCache extends BaseCache {
  public async get(key: string): Promise<CacheEntry | null> {
    const value = await kv.get(key).catch(() => null);
    return value ? parseCacheEntry(value) : null;
  }

  // Cloudflare KV has global replication
  public async put<T>(
    key: string,
    value: T,
    ttl: number,
    swr: number,
  ): Promise<void> {
    const cacheEntry = stringifyCacheEntry(key, value, ttl, swr);
    return kv
      .put(key, cacheEntry, {
        expirationTtl: ttl + swr,
      })
      .catch(() => {
        /* ignore */
        console.error("Failed to put cache KV entry", key);
      });
  }

  public async delete(key: string): Promise<void> {
    return kv.delete(key).catch(() => {
      /* ignore */
      console.error("Failed to delete cache KV entry", key);
    });
  }
}

export { KVCache };
