import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRoute } from "@/lib/auth"
import { updateProductSchema } from "@/lib/validation"
import { rateLimitRoute } from "@/lib/rate-limit"
import { getCachedData, cacheData, deleteCachedDataByPattern } from "@/lib/cache"

// Get a product by ID
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // Apply rate limiting
  const rateLimit = await rateLimitRoute(req)
  if (rateLimit.status === 429) return rateLimit

  try {
    const { id } = params

    // Try to get cached data
    const cacheKey = `product:${id}`
    const cachedData = await getCachedData(cacheKey)
    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    // Get product with reviews
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    })

    if (!product) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 })
    }

    // Calculate average rating
    const avgRating =
      product.reviews.length > 0
        ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
        : 0

    const productWithRating = {
      ...product,
      avgRating,
    }

    // Cache the response
    await cacheData(cacheKey, productWithRating, 300) // Cache for 5 minutes

    return NextResponse.json(productWithRating)
  } catch (error) {
    console.error("Get product error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

// Update a product
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
    const result = updateProductSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ message: "Invalid input", errors: result.error.format() }, { status: 400 })
    }

    // Check if product exists and belongs to user
    const existingProduct = await prisma.product.findUnique({
      where: { id },
    })

    if (!existingProduct) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 })
    }

    if (existingProduct.userId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 })
    }

    // Update product
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: result.data,
    })

    // Clear product cache
    await deleteCachedDataByPattern(`product:${id}`)
    await deleteCachedDataByPattern("products:*")

    return NextResponse.json(updatedProduct)
  } catch (error) {
    console.error("Update product error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

// Delete a product
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  // Apply rate limiting
  const rateLimit = await rateLimitRoute(req)
  if (rateLimit.status === 429) return rateLimit

  // Authenticate user
  const user = await authenticateRoute(req)
  if (!(user && "id" in user)) return user

  try {
    const { id } = params

    // Check if product exists and belongs to user
    const existingProduct = await prisma.product.findUnique({
      where: { id },
    })

    if (!existingProduct) {
      return NextResponse.json({ message: "Product not found" }, { status: 404 })
    }

    if (existingProduct.userId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 })
    }

    // Delete product
    await prisma.product.delete({
      where: { id },
    })

    // Clear product cache
    await deleteCachedDataByPattern(`product:${id}`)
    await deleteCachedDataByPattern("products:*")

    return NextResponse.json({ message: "Product deleted successfully" }, { status: 200 })
  } catch (error) {
    console.error("Delete product error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}

