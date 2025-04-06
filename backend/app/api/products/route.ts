import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRoute } from "@/lib/auth"
import { createProductSchema, getProductsSchema } from "@/lib/validation"
import { rateLimitRoute } from "@/lib/rate-limit"
import { getCachedData, cacheData, deleteCachedDataByPattern } from "@/lib/cache"

// Create a new product
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
    const result = createProductSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ message: "Invalid input", errors: result.error.format() }, { status: 400 })
    }

    const { title, description, price, category, imageUrl } = result.data

    // Create product
    const product = await prisma.product.create({
      data: {
        title,
        description,
        price,
        category,
        imageUrl,
        userId: user.id,
      },
    })

    // Clear product cache
    await deleteCachedDataByPattern("products:*")

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error("Product creation error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

// Get products with filtering, search, and pagination
export async function GET(req: NextRequest) {
  // Apply rate limiting
  const rateLimit = await rateLimitRoute(req)
  if (rateLimit.status === 429) return rateLimit

  try {
    const { searchParams } = new URL(req.url)

    // Parse and validate query parameters
    const params = {
      page: searchParams.get("page") ? Number.parseInt(searchParams.get("page")!) : 1,
      limit: searchParams.get("limit") ? Number.parseInt(searchParams.get("limit")!) : 10,
      category: searchParams.get("category") || undefined,
      minPrice: searchParams.get("minPrice") ? Number.parseFloat(searchParams.get("minPrice")!) : undefined,
      maxPrice: searchParams.get("maxPrice") ? Number.parseFloat(searchParams.get("maxPrice")!) : undefined,
      minRating: searchParams.get("minRating") ? Number.parseInt(searchParams.get("minRating")!) : undefined,
      search: searchParams.get("search") || undefined,
    }

    const result = getProductsSchema.safeParse(params)
    if (!result.success) {
      return NextResponse.json({ message: "Invalid parameters", errors: result.error.format() }, { status: 400 })
    }

    const { page, limit, category, minPrice, maxPrice, minRating } = result.data
    const search = params.search

    // Create cache key based on query parameters
    const cacheKey = `products:${page}:${limit}:${category || "all"}:${minPrice || "none"}:${maxPrice || "none"}:${minRating || "none"}:${search || "none"}`

    // Try to get cached data
    const cachedData = await getCachedData(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    // Build filter
    const where: any = { isActive: true }

    if (category) {
      where.category = category
    }

    if (minPrice !== undefined) {
      where.price = { ...(where.price || {}), gte: minPrice }
    }

    if (maxPrice !== undefined) {
      where.price = { ...(where.price || {}), lte: maxPrice }
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ]
    }

    // Get total count for pagination
    const total = await prisma.product.count({ where })

    // Get products
    let products = await prisma.product.findMany({
      where,
      include: {
        reviews: {
          select: {
            rating: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    })

    // Calculate average rating and filter by minRating if needed
    products = products.map((product) => {
      const avgRating =
        product.reviews.length > 0
          ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
          : 0

      return {
        ...product,
        avgRating,
      }
    })

    if (minRating !== undefined) {
      products = products.filter((product) => product.avgRating >= minRating)
    }

    const response = {
      data: products,
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
    console.error("Get products error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

