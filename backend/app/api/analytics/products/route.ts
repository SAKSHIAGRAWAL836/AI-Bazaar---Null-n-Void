import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRoute } from "@/lib/auth"
import { rateLimitRoute } from "@/lib/rate-limit"
import { getCachedData, cacheData } from "@/lib/cache"

// Get product analytics
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
    const cacheKey = "analytics:products"
    const cachedData = await getCachedData(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    // Get total products
    const totalProducts = await prisma.product.count()

    // Get products by category
    const productsByCategory = await prisma.product.groupBy({
      by: ["category"],
      _count: {
        id: true,
      },
    })

    // Get top rated products
    const products = await prisma.product.findMany({
      include: {
        reviews: {
          select: {
            rating: true,
          },
        },
      },
      take: 10,
    })

    const topRatedProducts = products
      .map((product) => {
        const avgRating =
          product.reviews.length > 0
            ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
            : 0

        return {
          id: product.id,
          title: product.title,
          price: product.price,
          category: product.category,
          avgRating,
          reviewCount: product.reviews.length,
        }
      })
      .sort((a, b) => b.avgRating - a.avgRating)
      .slice(0, 5)

    // Get products per day for the last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const productsByDay = await prisma.product.groupBy({
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
    const productTrendsData = Array.from({ length: 30 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - i)
      date.setHours(0, 0, 0, 0)

      const formattedDate = date.toISOString().split("T")[0]
      const count = productsByDay.find((item) => new Date(item.createdAt).toISOString().split("T")[0] === formattedDate)

      return {
        date: formattedDate,
        count: count ? count._count.id : 0,
      }
    }).reverse()

    const response = {
      totalProducts,
      productsByCategory,
      topRatedProducts,
      productTrends: productTrendsData,
    }

    // Cache the response
    await cacheData(cacheKey, response, 3600) // Cache for 1 hour

    return NextResponse.json(response)
  } catch (error) {
    console.error("Product analytics error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

