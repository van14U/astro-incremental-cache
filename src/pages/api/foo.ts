import type { APIRoute } from "astro"

export const GET: APIRoute = async (ctx) => {
  return Response.json({ message: "Hello, world!" }, {
    'headers': {
      'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=60'
    }
  })
}
