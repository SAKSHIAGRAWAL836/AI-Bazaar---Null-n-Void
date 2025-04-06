import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRoute } from "@/lib/auth"
import { rateLimitRoute } from "@/lib/rate-limit"
import { getCachedData, cacheData } from "@/lib/cache"

// Get user analytics
export async function GET(req: NextRequest) {
  // Apply rate limiting
  const rateLimit = await rateLimitRoute(req)
  if (rateLimit.status === 429) return rateLimit

  // Authenticate user and check if admin
  const user = await authenticateRoute(req)
  if (!(user && "id" in user)) return user

  if (user.role !== "ADMIN") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 })
  }

  try {
    // Try to get cached data
    const cacheKey = "analytics:users"
    const cachedData = await getCachedData(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    // Get total users
    const totalUsers = await prisma.user.count()

    // Get new users per day for the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const newUsers = await prisma.user.groupBy({
      by: ["createdAt"],
      where: {
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
      _count: {
        id: true,
      },
    })

    // Format data for chart
    const userGrowthData = Array.from({ length: 30 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - i)
      date.setHours(0, 0, 0, 0)

      const formattedDate = date.toISOString().split("T")[0]
      const count = newUsers.find((item) => new Date(item.createdAt).toISOString().split("T")[0] === formattedDate)

      return {
        date: formattedDate,
        count: count ? count._count.id : 0,
      }
    }).reverse()

    const response = {
      totalUsers,
      userGrowth: userGrowthData,
    }

    // Cache the response
    await cacheData(cacheKey, response, 3600) // Cache for 1 hour

    return NextResponse.json(response)
  } catch (error) {
    console.error("User analytics error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

