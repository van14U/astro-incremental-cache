import type { APIRoute } from "astro";
import { getCacheAPIWebhookHandler } from "../../lib/cache/test";
import type { DistributeOptions } from "../../lib/cache/test/cache-api";

export const POST: APIRoute = async (ctx) => {
  try {
    const body = (await ctx.request.json()) as DistributeOptions<unknown>;
    const cacheAdaptor = getCacheAPIWebhookHandler();
    if (body.action === "PUT") {
      await cacheAdaptor.put(body.key, body.value, body.ttl, body.swr);
    } else {
      await cacheAdaptor.delete(body.key);
    }
    return Response.json({ ok: true, acton: body.action });
  } catch (e) {
    return Response.json({ ok: false }, { status: 500 });
  }
};
