import {
  type CacheEntry,
  type CacheEntryOptions,
  buildCacheKey,
  getWaitUntil,
} from "./utils";

abstract class BaseCache {
  public abstract get(key: string): Promise<CacheEntry | null>;
  public abstract put<T>(
    key: string,
    value: T,
    ttl: number,
    swr: number,
  ): Promise<void>;
  public abstract delete(key: string): Promise<void>;

  public async cache<T>(
    getValue: () => Promise<T>,
    { key, ttl, swr }: CacheEntryOptions,
  ): Promise<T> {
    const cacheKey = buildCacheKey(key);
    const cacheEntry = await this.get(cacheKey);
    if (cacheEntry) {
      const { value, lastModified, ttl: cacheTtl, swr: cacheSwr } = cacheEntry;
      const maxAge = swr + ttl;
      const now = Date.now();
      let shouldRevalidate = false;
      let blocking = false;

      if (now - lastModified < ttl * 1000) {
        console.log("HIT");
      } else if (
        now - lastModified >= ttl * 1000 &&
        now - lastModified < maxAge * 1000
      ) {
        console.log("STALE + SWR");
        blocking = false;
        shouldRevalidate = true;
      } else if (now - lastModified >= maxAge * 1000) {
        console.log("STALE + EXPIRED");
        shouldRevalidate = true;
        blocking = true;
      }
      shouldRevalidate =
        shouldRevalidate || cacheTtl !== ttl || cacheSwr !== swr;

      if (!shouldRevalidate) {
        return value as T;
      }

      if (blocking) {
        const newValue = await getValue();
        getWaitUntil()?.(this.put(cacheKey, newValue, ttl, swr));
        return newValue;
      } else {
        getWaitUntil()?.(
          getValue().then(async (newValue) =>
            this.put(cacheKey, newValue, ttl, swr),
          ),
        );
      }
      return value as T;
    }
    console.log("MISS");
    const newValue = await getValue();
    getWaitUntil()?.(this.put(cacheKey, newValue, ttl, swr));
    return newValue;
  }
}

export { BaseCache };
