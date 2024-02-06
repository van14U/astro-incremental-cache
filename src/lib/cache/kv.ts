import { binding } from "cf-bindings-proxy";

const kv = binding<KVNamespace>("KV_CACHE");

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

async function revalidateStale() {
  console.log("REVALIDATING STALE");
  for (const [key, { entry, promise }] of toRevalidate.entries()) {
    console.log("REVALIDATING", key);
    const result = await promise;
    console.log("REVALIDATED", result);
    const maxAge = entry.maxAge;
    const cacheEntry = stringifyCacheEntry(key, result, entry.ttl, maxAge);
    console.log("PUT", result);
    await kv.put(key, cacheEntry, { expirationTtl: maxAge });
  }
  toRevalidate.clear();
}

function parseCacheEntry(entry: string) {
  return JSON.parse(entry) as CacheEntry;
}

type Task = Promise<any>;

const tasks: Array<Task> = [];

function addTask(task: Task) {
  tasks.push(task);
}

// used by kv.put
export async function __runBackgroundTasks() {
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
  await revalidateStale();
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
    const cacheKey = buildCacheKey(options.key);
    const res = await kv.get(cacheKey);
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

      addTask(kv.put(cacheKey, cacheEntry));
      return result;
    }
    let cachedRes = parseCacheEntry(res);
    if (
      (now - cachedRes.lastModified) / 1000 >= cachedRes.ttl ||
      cachedRes.ttl !== options.ttl ||
      cachedRes.maxAge !== maxAge
    ) {
      console.log((now - cachedRes.lastModified) / 1000, cachedRes.ttl);
      console.log("STALE", cachedRes.value);

      if ((now - cachedRes.lastModified) / 1000 >= cachedRes.maxAge) {
        console.log("STALE MAX AGE", cachedRes.value);
        const result = await cb(...args);
        const cacheEntry = stringifyCacheEntry(
          cacheKey,
          result,
          options.ttl,
          maxAge,
        );
        console.log("PUT", result);
        addTask(kv.put(cacheKey, cacheEntry));
        return result;
      }

      cachedRes.ttl = options.ttl;
      cachedRes.maxAge = maxAge;
      toRevalidate.set(cacheKey, { entry: cachedRes, promise: cb(...args) });
      return cachedRes.value;
    }
    console.log("HIT", cachedRes.value);
    return cachedRes.value;
  }) as T;
}

export async function invalidateCache(key: string) {
  return kv.delete(buildCacheKey(key));
}
