import type { APIRoute } from "astro";
import { invalidate } from "@/lib/cache/test";

export const GET: APIRoute = async (ctx) => {
  try {
    const url = new URL(ctx.request.url);
    const key = url.searchParams.get("key");
    const strategy = url.searchParams.get("strategy") as
      | "local"
      | "global"
      | undefined;
    if (!key || !strategy) {
      return Response.json({ ok: false }, { status: 400 });
    }
    const ok = await invalidate(key, strategy)
      .then(() => true)
      .catch(() => false);
    return Response.json({ ok });
  } catch (e) {
    return Response.json({ ok: false }, { status: 500 });
  }
};
