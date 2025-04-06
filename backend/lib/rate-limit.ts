import type { NextApiRequest, NextApiResponse } from "next"
import { type NextRequest, NextResponse } from "next/server"
import { Redis } from "@upstash/redis"

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Rate limiting for API routes
export const rateLimit = async (
  req: NextApiRequest,
  res: NextApiResponse,
  next: () => void,
  { limit = 10, window = 60 } = {},
) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress
  const key = `rate-limit:${ip}:${req.url}`

  try {
    const count = await redis.incr(key)

    if (count === 1) {
      await redis.expire(key, window)
    }

    res.setHeader("X-RateLimit-Limit", limit)
    res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - count))

    if (count > limit) {
      return res.status(429).json({ message: "Too many requests, please try again later" })
    }

    next()
  } catch (error) {
    console.error("Rate limiting error:", error)
    next()
  }
}

// Rate limiting for App Router
export async function rateLimitRoute(req: NextRequest, { limit = 10, window = 60 } = {}) {
  const ip = req.headers.get("x-forwarded-for") || "unknown"
  const key = `rate-limit:${ip}:${req.nextUrl.pathname}`

  try {
    const count = await redis.incr(key)

    if (count === 1) {
      await redis.expire(key, window)
    }

    const response = NextResponse.next()
    response.headers.set("X-RateLimit-Limit", limit.toString())
    response.headers.set("X-RateLimit-Remaining", Math.max(0, limit - count).toString())

    if (count > limit) {
      return new NextResponse(JSON.stringify({ message: "Too many requests, please try again later" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })
    }

    return response
  } catch (error) {
    console.error("Rate limiting error:", error)
    return NextResponse.next()
  }
}

