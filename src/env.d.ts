/// <reference types="astro/client" />

// import type { Cache } from "@epic-web/cachified";

type CachifiedCache = import("@epic-web/cachified").Cache;
type KVNamespace = import("@cloudflare/workers-types").KVNamespace;
type ENV = {
  KV_CACHE: KVNamespace;
  CACHIFIED_KV_CACHE: CachifiedCache;
};

// Depending on your adapter mode
// use `AdvancedRuntime<ENV>` for advance runtime mode
// use `DirectoryRuntime<ENV>` for directory runtime mode
type Runtime = import("@astrojs/cloudflare").AdvancedRuntime<ENV>;
declare namespace App {
  interface Locals extends Runtime { }
}
