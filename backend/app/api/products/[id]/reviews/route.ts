import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRoute } from "@/lib/auth"
import { createReviewSchema } from "@/lib/validation"
import { rateLimitRoute } from "@/lib/rate-limit"
import { deleteCachedDataByPattern } from "@/lib/cache"

// Create a review for a product
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Apply rate limiting
  const rateLimit = await rateLimitRoute(req)
  if (rateLimit.status === 429) return rateLimit

  // Authenticate user
  const user = await authenticateRoute(req)
  if (!(user && "id" in user)) return user

  try {
    const { id } = params
    const body = await req.json()

    // Validate input
    const result = createReviewSchema.safeParse({
      ...body,
      productId: id,
    })

    if (!result.success) {
      return NextResponse.json({ message: "Invalid input", errors: result.error.format() }, { status: 400 })
    }

    const { rating, comment, productId } = result.data

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    })

    if (!product) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 })
    }

    // Check if user has already reviewed this product
    const existingReview = await prisma.review.findFirst({
      where: {
        productId,
        userId: user.id,
      },
    })

    if (existingReview) {
      // Update existing review
      const updatedReview = await prisma.review.update({
        where: { id: existingReview.id },
        data: {
          rating,
          comment,
        },
      })

      // Clear product cache
      await deleteCachedDataByPattern(`product:${productId}`)
      await deleteCachedDataByPattern("products:*")

      return NextResponse.json(updatedReview)
    }

    // Create new review
    const review = await prisma.review.create({
      data: {
        rating,
        comment,
        productId,
        userId: user.id,
      },
    })

    // Clear product cache
    await deleteCachedDataByPattern(`product:${productId}`)
    await deleteCachedDataByPattern("products:*")

    return NextResponse.json(review, { status: 201 })
  } catch (error) {
    console.error("Review creation error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

// Get reviews for a product
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Apply rate limiting
  const rateLimit = await rateLimitRoute(req)
  if (rateLimit.status === 429) return rateLimit

  try {
    const { id } = params
    const { searchParams } = new URL(req.url)

    const page = searchParams.get("page") ? Number.parseInt(searchParams.get("page")!) : 1
    const limit = searchParams.get("limit") ? Number.parseInt(searchParams.get("limit")!) : 10

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id },
    })

    if (!product) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 })
    }

    // Get total count for pagination
    const total = await prisma.review.count({
      where: { productId: id },
    })

    // Get reviews
    const reviews = await prisma.review.findMany({
      where: { productId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    })

    return NextResponse.json({
      data: reviews,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Get reviews error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

