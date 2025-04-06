import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRoute } from "@/lib/auth"
import { createTransactionSchema, getTransactionsSchema } from "@/lib/validation"
import { rateLimitRoute } from "@/lib/rate-limit"
import { getCachedData, cacheData, deleteCachedDataByPattern } from "@/lib/cache"

// Create a new transaction
export async function POST(req: NextRequest) {
  // Apply rate limiting
  const rateLimit = await rateLimitRoute(req)
  if (rateLimit.status === 429) return rateLimit

  // Authenticate user
  const user = await authenticateRoute(req)
  if (!(user && "id" in user)) return user

  try {
    const body = await req.json()

    // Validate input
    const result = createTransactionSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ message: "Invalid input", errors: result.error.format() }, { status: 400 })
    }

    const { amount, type, description } = result.data

    // Create transaction
    const transaction = await prisma.transaction.create({
      data: {
        amount,
        type,
        description,
        userId: user.id,
      },
    })

    // Clear cached transactions for this user
    await deleteCachedDataByPattern(`transactions:${user.id}:*`)

    return NextResponse.json(transaction, { status: 201 })
  } catch (error) {
    console.error("Transaction creation error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

// Get transactions with filtering and pagination
export async function GET(req: NextRequest) {
  // Apply rate limiting
  const rateLimit = await rateLimitRoute(req)
  if (rateLimit.status === 429) return rateLimit

  // Authenticate user
  const user = await authenticateRoute(req)
  if (!(user && "id" in user)) return user

  try {
    const { searchParams } = new URL(req.url)

    // Parse and validate query parameters
    const params = {
      page: searchParams.get("page") ? Number.parseInt(searchParams.get("page")!) : 1,
      limit: searchParams.get("limit") ? Number.parseInt(searchParams.get("limit")!) : 10,
      type: searchParams.get("type") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    }

    const result = getTransactionsSchema.safeParse(params)
    if (!result.success) {
      return NextResponse.json({ message: "Invalid parameters", errors: result.error.format() }, { status: 400 })
    }

    const { page, limit, type, startDate, endDate } = result.data

    // Create cache key based on query parameters
    const cacheKey = `transactions:${user.id}:${page}:${limit}:${type || "all"}:${startDate || "none"}:${endDate || "none"}`

    // Try to get cached data
    const cachedData = await getCachedData(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    // Build filter
    const where: any = { userId: user.id }

    if (type) {
      where.type = type
    }

    if (startDate) {
      where.createdAt = { ...(where.createdAt || {}), gte: new Date(startDate) }
    }

    if (endDate) {
      where.createdAt = { ...(where.createdAt || {}), lte: new Date(endDate) }
    }

    // Get total count for pagination
    const total = await prisma.transaction.count({ where })

    // Get transactions
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    })

    const response = {
      data: transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }

    // Cache the response
    await cacheData(cacheKey, response, 300) // Cache for 5 minutes

    return NextResponse.json(response)
  } catch (error) {
    console.error("Get transactions error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

