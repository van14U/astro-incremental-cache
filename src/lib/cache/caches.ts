import type { ExecutionContext } from "@cloudflare/workers-types";
import { cacheApi } from "cf-bindings-proxy";

type CacheEntry = {
  key: string;
  value: unknown;
  ttl: number;
  maxAge: number;
  lastModified: number;
};

type Callback = (...args: any[]) => Promise<any>;

const toRevalidate = new Map<
  string,
  { entry: CacheEntry; promise: Promise<any> }
>();

function buildCacheKey(key: string) {
  return `https://INCREMENTAL_CACHE.local/entry/${key}` as const;
}

const count = { value: 0 };

const CACHE_NAME = "__incremental-cache";

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
  } satisfies CacheEntry);
}

// async function revalidateStale() {
//   const cache = await cacheApi(CACHE_NAME);
//   console.log("STALE ENTRIES", toRevalidate.size);
//   for (const [key, { entry, promise }] of toRevalidate.entries()) {
//     console.log("REVALIDATING", key);
//     const result = await promise;
//     console.log("REVALIDATED", result);
//     const maxAge = entry.maxAge;
//     const cacheEntry = stringifyCacheEntry(key, result, entry.ttl, maxAge);
//     console.log("PUT", result);
//     await cache.put(
//       key,
//       // @ts-ignore
//       new Response(cacheEntry, {
//         headers: new Headers({
//           "Cache-Control": `s-maxage=${maxAge}`,
//         }),
//       }),
//     );
//   }
//   toRevalidate.clear();
// }

function parseCacheEntry(entry: string) {
  return JSON.parse(entry) as CacheEntry;
}

type Task = Promise<any>;

const tasks: Array<Task> = [];

function addTask(task: Task) {
  tasks.push(task);
}

// used by cache.put
export async function __runBackgroundTasks() {
  console.log("__runBackgroundTasks", tasks.length);
  for (const task of tasks) {
    try {
      await task;
    } catch (e) {
      console.log("ERROR RUNNING BACKGROUND TASK");
      console.error(e);
    }
  }
  // clear tasks
  tasks.splice(0, tasks.length);
}

export function incrementalCache<T extends Callback>(
  cb: T,
  options: {
    key: string;
    ttl: number;
    swr?: number;
  },
): T {
  return (async (...args: any[]): Promise<any> => {
    const now = Date.now();
    const cache = await cacheApi(CACHE_NAME);
    const cacheKey = buildCacheKey(options.key);
    const res = await cache.match(cacheKey);
    const maxAge =
      typeof options.swr === "number" ? options.swr + options.ttl : 31_536_000;
    if (!res) {
      const result = await cb(...args);
      console.log("MISS", result);
      const cacheEntry = stringifyCacheEntry(
        cacheKey,
        result,
        options.ttl,
        maxAge,
      );
      console.log("PUT", result);

      addTask(
        cache.put(
          cacheKey,
          // @ts-ignore
          new Response(cacheEntry, {
            headers: new Headers({
              "Cache-Control": `s-maxage=${maxAge}`,
            }),
          }),
        ),
      );
      executionContext?.waitUntil?.(__runBackgroundTasks());
      return result;
    }
    let cachedRes = parseCacheEntry(await res.text());
    if (
      (now - cachedRes.lastModified) / 1000 >= cachedRes.ttl ||
      cachedRes.ttl !== options.ttl ||
      cachedRes.maxAge !== maxAge
    ) {
      console.log((now - cachedRes.lastModified) / 1000, cachedRes.ttl);
      console.log("STALE", cachedRes.value);
      // cachedRes.ttl = options.ttl;
      // cachedRes.maxAge = maxAge;
      addTask(
        cb(...args).then(async (result) => {
          console.log("REVALIDATED", result);
          const cacheEntry = stringifyCacheEntry(
            cacheKey,
            result,
            options.ttl,
            maxAge,
          );
          await cache.put(
            cacheKey,
            // @ts-ignore
            new Response(cacheEntry, {
              headers: new Headers({
                "Cache-Control": `s-maxage=${maxAge}`,
              }),
            }),
          );
          console.log("PUT", result);
        }),
      );
      executionContext?.waitUntil?.(__runBackgroundTasks());
      return cachedRes.value;
    }
    console.log("HIT", cachedRes.value);
    return cachedRes.value;
  }) as T;
}

export async function invalidateCache(key: string) {
  const cache = await cacheApi(CACHE_NAME);
  return cache.delete(buildCacheKey(key));
}
