import type { NextApiRequest, NextApiResponse } from "next"
import { type NextRequest, NextResponse } from "next/server"
import { sign, verify } from "jsonwebtoken"
import { hash, compare } from "bcryptjs"
import { prisma } from "./prisma"
import type { User } from "@prisma/client"

// JWT token generation
export const generateToken = (user: Partial<User>) => {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  }

  return sign(payload, process.env.JWT_SECRET!, { expiresIn: "7d" })
}

// Password hashing
export const hashPassword = async (password: string) => {
  return await hash(password, 12)
}

// Password verification
export const verifyPassword = async (password: string, hashedPassword: string) => {
  return await compare(password, hashedPassword)
}

// Authentication middleware for API routes
export const authenticate = async (req: NextApiRequest, res: NextApiResponse, next: () => void) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]

    if (!token) {
      return res.status(401).json({ message: "Authentication required" })
    }

    const decoded = verify(token, process.env.JWT_SECRET!) as { id: string }
    const user = await prisma.user.findUnique({ where: { id: decoded.id } })

    if (!user) {
      return res.status(401).json({ message: "User not found" })
    }

    // @ts-ignore
    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" })
  }
}

// Authentication middleware for App Router
export const authenticateRoute = async (req: NextRequest) => {
  try {
    const token = req.headers.get("authorization")?.split(" ")[1]

    if (!token) {
      return new NextResponse(JSON.stringify({ message: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    const decoded = verify(token, process.env.JWT_SECRET!) as { id: string }
    const user = await prisma.user.findUnique({ where: { id: decoded.id } })

    if (!user) {
      return new NextResponse(JSON.stringify({ message: "User not found" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    return user
  } catch (error) {
    return new NextResponse(JSON.stringify({ message: "Invalid token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }
}

// Role-based authorization middleware
export const authorize = (roles: string[]) => {
  return (req: NextApiRequest, res: NextApiResponse, next: () => void) => {
    // @ts-ignore
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" })
    }

    // @ts-ignore
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" })
    }

    next()
  }
}

