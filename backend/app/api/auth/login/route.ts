import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPassword, generateToken } from "@/lib/auth"
import { loginSchema } from "@/lib/validation"
import { rateLimitRoute } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  // Apply rate limiting
  const rateLimit = await rateLimitRoute(req, { limit: 5, window: 60 })
  if (rateLimit.status === 429) return rateLimit

  try {
    const body = await req.json()

    // Validate input
    const result = loginSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ message: "Invalid input", errors: result.error.format() }, { status: 400 })
    }

    const { email, password } = result.data

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user || !user.password) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 })
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password)

    if (!isPasswordValid) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 })
    }

    // Generate JWT token
    const token = generateToken(user)

    // Return user data (excluding password) and token
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
      theme: "light", // Default theme, can be customized per user
    })
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

