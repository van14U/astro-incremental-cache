import { BaseCache } from "./base";
import { cacheApi } from "cf-bindings-proxy";
import { parseCacheEntry, type CacheEntry, stringifyCacheEntry } from "./utils";

type DistributeOptions<T> =
  | {
      action: "PUT";
      key: string;
      value: T;
      ttl: number;
      swr: number;
      route: string;
    }
  | { action: "DELETE"; key: string; route: string };

type DistributeMetadata =
  | {
      enabled: true;
      route: string;
    }
  | { enabled: false };

class CacheApiCache extends BaseCache {
  public CACHE_NAME = "__incremental-cache";
  public distributeMetadata: DistributeMetadata;

  constructor(metadata: DistributeMetadata) {
    super();
    if (metadata.enabled) {
      this.distributeMetadata = {
        enabled: metadata.enabled,
        route: metadata.route,
      };
    } else {
      this.distributeMetadata = { enabled: false };
    }
  }

  public async get(key: string): Promise<CacheEntry | null> {
    const cache = await cacheApi(this.CACHE_NAME);
    const value = await cache
      .match(key)
      .then((response) => (response ? response.text() : null))
      .catch(() => null);
    return value ? parseCacheEntry(value) : null;
  }

  // Cloudflare Cache API doesn't have global replication, (no tiered caching)
  public async put<T>(
    key: string,
    value: T,
    ttl: number,
    swr: number,
  ): Promise<void> {
    const cache = await cacheApi(this.CACHE_NAME);
    const cacheEntry = stringifyCacheEntry(key, value, ttl, swr);
    const response = new Response(cacheEntry, {
      headers: new Headers({
        "Cache-Control": `s-maxage=${ttl + swr}`,
      }),
    });
    // @ts-ignore
    await cache.put(key, response).catch(() => {
      /* ignore */
      console.error("Failed to put cache api entry", key);
    });
    if (this.distributeMetadata.enabled) {
      await this.distribute({
        action: "PUT",
        key,
        value,
        swr,
        ttl,
        route: this.distributeMetadata.route,
      }).catch((e) => {
        console.log("Failed to distribute cache api entry", e);
        /* ignore */
        console.error("Failed to distribute cache api entry", key);
      });
    }
  }

  private async distribute<T>(options: DistributeOptions<T>) {
    console.log("distribute options", options);
    return fetch("https://vercel-geo-delta.vercel.app/api/distribute", {
      method: "POST",
      body: JSON.stringify(options),
    }).then(async (response) => {
      console.log('distribute response', response);
      const json = await response.json();
      console.log("distribute response json", json);
      if (!response.ok) {
        throw new Error();
      }
    });
  }

  public async delete(key: string): Promise<void> {
    const cache = await cacheApi(this.CACHE_NAME);
    await cache.delete(key).catch(() => {
      /* ignore */
      console.error("Failed to delete cache api entry", key);
    });
    if (this.distributeMetadata.enabled) {
      await this.distribute({
        action: "DELETE",
        key,
        route: this.distributeMetadata.route,
      }).catch(() => {
        /* ignore */
        console.error("Failed to distribute cache api entry", key);
      });
    }
  }
}

export { CacheApiCache, type DistributeMetadata, type DistributeOptions };
