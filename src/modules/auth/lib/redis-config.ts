import { env } from "@/env";

const redisUrl = env.REDIS_URL ? new URL(env.REDIS_URL) : null;

export const redisConfig = {
	host: redisUrl?.hostname ?? env.REDIS_HOST ?? "localhost",
	port: Number(redisUrl?.port || env.REDIS_PORT || 6379),
	username: redisUrl?.username || undefined,
	password: redisUrl?.password || undefined,
	...(redisUrl?.protocol === "rediss:" ? { tls: {} } : {}),
	// BullMQ workers must not have ioredis' finite command-retry limit.
	maxRetriesPerRequest: null,
};
