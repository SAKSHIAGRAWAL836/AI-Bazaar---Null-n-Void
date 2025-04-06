import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRoute } from "@/lib/auth"
import { rateLimitRoute } from "@/lib/rate-limit"
import { getCachedData, cacheData } from "@/lib/cache"

// Get transaction analytics
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
    const cacheKey = "analytics:transactions"
    const cachedData = await getCachedData(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    // Get total transactions
    const totalTransactions = await prisma.transaction.count()

    // Get total transaction amount
    const totalAmount = await prisma.transaction.aggregate({
      _sum: {
        amount: true,
      },
    })

    // Get transactions by type
    const transactionsByType = await prisma.transaction.groupBy({
      by: ["type"],
      _count: {
        id: true,
      },
      _sum: {
        amount: true,
      },
    })

    // Get transactions per day for the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const transactionsByDay = await prisma.transaction.groupBy({
      by: ["createdAt", "type"],
      where: {
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
      _sum: {
        amount: true,
      },
    })

    // Format data for chart
    const transactionTrendsData = Array.from({ length: 30 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - i)
      date.setHours(0, 0, 0, 0)

      const formattedDate = date.toISOString().split("T")[0]

      const deposits = transactionsByDay.filter(
        (item) => new Date(item.createdAt).toISOString().split("T")[0] === formattedDate && item.type === "DEPOSIT",
      )

      const withdrawals = transactionsByDay.filter(
        (item) => new Date(item.createdAt).toISOString().split("T")[0] === formattedDate && item.type === "WITHDRAWAL",
      )

      const purchases = transactionsByDay.filter(
        (item) => new Date(item.createdAt).toISOString().split("T")[0] === formattedDate && item.type === "PURCHASE",
      )

      const sales = transactionsByDay.filter(
        (item) => new Date(item.createdAt).toISOString().split("T")[0] === formattedDate && item.type === "SALE",
      )

      return {
        date: formattedDate,
        deposits: deposits.reduce((sum, item) => sum + (item._sum.amount || 0), 0),
        withdrawals: withdrawals.reduce((sum, item) => sum + (item._sum.amount || 0), 0),
        purchases: purchases.reduce((sum, item) => sum + (item._sum.amount || 0), 0),
        sales: sales.reduce((sum, item) => sum + (item._sum.amount || 0), 0),
      }
    }).reverse()

    const response = {
      totalTransactions,
      totalAmount: totalAmount._sum.amount || 0,
      transactionsByType,
      transactionTrends: transactionTrendsData,
    }

    // Cache the response
    await cacheData(cacheKey, response, 3600) // Cache for 1 hour

    return NextResponse.json(response)
  } catch (error) {
    console.error("Transaction analytics error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

