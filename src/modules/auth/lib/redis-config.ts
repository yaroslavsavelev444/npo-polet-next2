import { env } from "@/env";

const redisUrl = env.REDIS_URL ? new URL(env.REDIS_URL) : null;

export const redisConfig = {
	host: redisUrl?.hostname ?? env.REDIS_HOST ?? "localhost",
	port: Number(redisUrl?.port || env.REDIS_PORT || 6379),
	username: redisUrl?.username || undefined,
	// REDIS_PASSWORD имеет приоритет над паролем внутри REDIS_URL: он не
	// требует percent-кодирования и задаётся тем же значением, которым сервер
	// Redis поднимается с --requirepass (см. docker-compose.prod.yml).
	password: env.REDIS_PASSWORD || redisUrl?.password || undefined,
	...(redisUrl?.protocol === "rediss:" ? { tls: {} } : {}),
	// BullMQ workers must not have ioredis' finite command-retry limit.
	maxRetriesPerRequest: null,
};
