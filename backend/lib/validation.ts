import { z } from "zod"

// User validation schemas
export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// Transaction validation schemas
export const createTransactionSchema = z.object({
  amount: z.number().positive(),
  type: z.enum(["DEPOSIT", "WITHDRAWAL", "PURCHASE", "SALE", "REFUND"]),
  description: z.string().optional(),
})

export const getTransactionsSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().optional().default(10),
  type: z.enum(["DEPOSIT", "WITHDRAWAL", "PURCHASE", "SALE", "REFUND"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

// Product validation schemas
export const createProductSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().optional(),
  price: z.number().positive(),
  category: z.string().min(1),
  imageUrl: z.string().url().optional(),
})

export const updateProductSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  category: z.string().min(1).optional(),
  imageUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
})

export const getProductsSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().optional().default(10),
  category: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  minRating: z.number().int().min(1).max(5).optional(),
})

// Review validation schemas
export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  productId: z.string(),
})

