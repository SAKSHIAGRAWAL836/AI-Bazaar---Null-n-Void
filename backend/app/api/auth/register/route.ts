import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword, generateToken } from "@/lib/auth"
import { registerSchema } from "@/lib/validation"
import { rateLimitRoute } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  // Apply rate limiting
  const rateLimit = await rateLimitRoute(req, { limit: 5, window: 60 })
  if (rateLimit.status === 429) return rateLimit

  try {
    const body = await req.json()

    // Validate input
    const result = registerSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ message: "Invalid input", errors: result.error.format() }, { status: 400 })
    }

    const { name, email, password } = result.data

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json({ message: "User already exists" }, { status: 409 })
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    })

    // Generate JWT token
    const token = generateToken(user)

    // Return user data (excluding password) and token
    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        token,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

