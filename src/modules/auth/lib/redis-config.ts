import { env } from "@/env";

export const redisConfig = {
  host: env.REDIS_HOST ?? 'localhost',
  port: Number(env.REDIS_PORT ?? 6379),
}