import { Redis } from "@upstash/redis"

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Cache data with expiration
export const cacheData = async (key: string, data: any, expiration = 3600) => {
  try {
    await redis.set(key, JSON.stringify(data), { ex: expiration })
    return true
  } catch (error) {
    console.error("Cache error:", error)
    return false
  }
}

// Get cached data
export const getCachedData = async (key: string) => {
  try {
    const data = await redis.get(key)
    return data ? JSON.parse(data as string) : null
  } catch (error) {
    console.error("Cache retrieval error:", error)
    return null
  }
}

// Delete cached data
export const deleteCachedData = async (key: string) => {
  try {
    await redis.del(key)
    return true
  } catch (error) {
    console.error("Cache deletion error:", error)
    return false
  }
}

// Delete cached data by pattern
export const deleteCachedDataByPattern = async (pattern: string) => {
  try {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
    return true
  } catch (error) {
    console.error("Cache pattern deletion error:", error)
    return false
  }
}

