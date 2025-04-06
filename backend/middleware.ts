import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Get the response
  const response = NextResponse.next()

  // Add security headers
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-XSS-Protection", "1; mode=block")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

  // Add CORS headers for API routes
  if (request.nextUrl.pathname.startsWith("/api")) {
    response.headers.set("Access-Control-Allow-Credentials", "true")
    response.headers.set("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*")
    response.headers.set("Access-Control-Allow-Methods", "GET,DELETE,PATCH,POST,PUT")
    response.headers.set(
      "Access-Control-Allow-Headers",
      "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
    )

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 200, headers: response.headers })
    }
  }

  return response
}

export const config = {
  matcher: [
    // Apply to all API routes
    "/api/:path*",
  ],
}

