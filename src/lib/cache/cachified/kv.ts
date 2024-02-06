import { cachified } from "@epic-web/cachified";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getTime(env: ENV) {
  console.log({ env });
  return cachified({
    key: "hello",
    cache: env.CACHIFIED_KV_CACHE,
    async getFreshValue() {
      return sleep(3000).then(() => new Date().toLocaleTimeString());
    },
    ttl: 20_000, // 20 seconds
    staleWhileRevalidate: 3_600_000, // 1 hour
  })
    .then((value) => {
      console.log("value", value);
      return value;
    })
    .catch((err) => {
      console.log("err", err);
      throw err;
    });
}
