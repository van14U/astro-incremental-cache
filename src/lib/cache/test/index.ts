import type { BaseCache } from "./base";
import { KVCache } from "./kv";
import { CacheApiCache, type DistributeMetadata } from "./cache-api";
import type { Callback } from "./utils";

function createCacheInstance(
  metadata: DistributeMetadata,
  forceCacheAPI: boolean,
): BaseCache {
  // @ts-ignore
  if (process.env.KV_CACHE && !forceCacheAPI) {
    console.log("Using KV cache");
    return new KVCache();
  }
  console.log("Using Cache API cache");
  console.log("metadata", metadata);
  return new CacheApiCache(metadata);
}

export function getCacheAPIWebhookHandler() {
  return new CacheApiCache({ enabled: false });
}

const ONE_YEAR_IN_SECONDS = 31_536_000;

export function incrementalCache<T extends Callback>(
  cb: T,
  {
    key,
    ttl,
    swr,
    forceCacheAPI = false,
    distributeCacheApi = true,
  }: {
    key: string;
    ttl: number;
    swr?: number;
    forceCacheAPI?: boolean;
    distributeCacheApi?: boolean;
  },
): T {
  if (ttl < 0 || (swr ?? 0) < 0) {
    throw new Error("ttl or swr must be greater or equal to 0");
  }
  if (ttl > ONE_YEAR_IN_SECONDS) {
    throw new Error("ttl must be less or equal to 1 year");
  }
  // @ts-ignore
  console.log("process.env.CF_PAGES_URL", process.env.CF_PAGES_URL);
  // @ts-ignore
  console.log("process.env.PORT", process.env.PORT);
  // @ts-ignore
  console.log("process.env.NODE_ENV", process.env.NODE_ENV);
  let baseUrl =
    // @ts-ignore
    process.env.CF_PAGES_URL ??
    `http://localhost:${
      // @ts-ignore
      process.env.PORT ?? process.env.NODE_ENV === "production" ? 8788 : 4321
    }`;
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }
  console.log("baseUrl", baseUrl);
  const metadata = {
    enabled: distributeCacheApi,
    route: `${baseUrl}/api/cache-update`,
  };
  const inferSwr = swr ?? ONE_YEAR_IN_SECONDS - ttl;
  if (ttl + inferSwr > ONE_YEAR_IN_SECONDS) {
    throw new Error("ttl + swr must be less or equal to 1 year");
  }
  const cacheAdaptor = createCacheInstance(metadata, forceCacheAPI);
  return (async (...args: any[]): Promise<any> => {
    const getValue = async () => cb(...args);
    const value = await cacheAdaptor.cache(getValue, {
      key,
      ttl,
      swr: inferSwr,
    });
    return value;
  }) as T;
}