import { cacheApi } from 'cf-bindings-proxy';

type CacheEntry = {
  key: string;
  value: unknown;
  ttl: number;
  maxAge: number;
  lastModified: number;
}

type Callback = (...args: any[]) => Promise<any>;

const toRevalidate = new Map<string, { entry: CacheEntry, cb: Callback }>();

function buildCacheKey(key: string) {
  return `https://INCREMENTAL_CACHE.local/entry/${key}` as const;
}

function stringifyCacheEntry(
  key: string,
  value: unknown,
  ttl: number,
  maxAge: number,
) {
  return JSON.stringify({
    key,
    value,
    ttl,
    maxAge,
    lastModified: Date.now(),
  } satisfies CacheEntry)
}



export async function revalidateStale() {
  const caches = await cacheApi("__incremental-cache");
  for (const [key, { entry, cb }] of toRevalidate.entries()) {
    console.log('REVALIDATING', key)
    const warp = await caches.match(buildCacheKey(`${key}-warp`));
    if (!warp) {
      console.log('PUT WARP', key)
      await caches.put(
        buildCacheKey(`${key}-warp`),
        // @ts-ignore
        new Response('REVALIDATING')
      );
    }
    const warpValue = await warp?.text();
    console.log('WARP VALUE CHECK', warpValue)
    if (warpValue === 'REVALIDATING') {
      console.log('SKIP PUT', key)
      continue;
    }
    const result = await cb();
    const maxAge = entry.maxAge;
    const cacheEntry = stringifyCacheEntry(
      key,
      result,
      entry.ttl,
      maxAge,
    );
    console.log('PUT', result);
    await caches.put(
      buildCacheKey(key),
      // @ts-ignore
      new Response(cacheEntry, {
        headers: new Headers({
          'Cache-Control': `public, s-maxage=${maxAge}`
        })
      }));
    console.log('DELETE WARP', key)
    await caches.delete(buildCacheKey(`${key}-warp`));
  }
  toRevalidate.clear();
  return null
}

function parseCacheEntry(entry: string) {
  return JSON.parse(entry) as CacheEntry;
}

export function incrementalCache<T extends Callback>(cb: T, options: {
  key: string,
  ttl: number,
  swr?: number,
}): T {
  return (async (...args: any[]): Promise<any> => {
    const now = Date.now();
    const caches = await cacheApi("__incremental-cache");
    const res = await caches.match(buildCacheKey(options.key));
    const maxAge = typeof options.swr === 'number'
      ? options.swr + options.ttl : 31_536_000;
    if (!res) {
      const result = await cb(...args);
      console.log('MISS', result)
      // const maxAge = typeof options.swr === 'number'
      //   ? options.swr + options.ttl : 31_536_000;
      const cacheEntry = stringifyCacheEntry(
        options.key,
        result,
        options.ttl,
        maxAge,
      );
      console.log('PUT', result);
      await caches.put(
        buildCacheKey(options.key),
        // @ts-ignore
        new Response(cacheEntry, {
          headers: new Headers({
            'Cache-Control': `public, s-maxage=${maxAge}`
          })
        }));
      return result;
    }
    let cachedRes = parseCacheEntry(await res.text())
    // console.log('CACHED', cachedRes)
    if (((now - cachedRes.lastModified) / 1000 >= cachedRes.ttl) ||
      cachedRes.ttl !== options.ttl || cachedRes.maxAge !== maxAge
    ) {
      console.log((now - cachedRes.lastModified) / 1000, cachedRes.ttl)
      console.log('STALE', cachedRes.value)
      cachedRes.ttl = options.ttl;
      cachedRes.maxAge = maxAge;
      toRevalidate.set(options.key, { entry: cachedRes, cb });
      return cachedRes.value;
      // const result = await cb(...args);
      // const maxAge = typeof options.swr === 'number'
      //   ? options.swr + options.ttl : 31_536_000;
      // const cacheEntry = stringifyCacheEntry(
      //   options.key,
      //   result,
      //   options.ttl,
      //   maxAge,
      // );
      // await caches.put(
      //   buildCacheKey(options.key),
      //   // @ts-ignore
      //   new Response(cacheEntry, {
      //     headers: new Headers({
      //       'Cache-Control': `public, s-maxage=${maxAge}`
      //     })
      //   }));
      // return result;
    }
    console.log('HIT', cachedRes.value)
    return cachedRes.value;
  }) as T;
}

export async function invalidateCache(key: string) {
  const caches = await cacheApi("__incremental-cache");
  return caches.delete(buildCacheKey(key));
}

