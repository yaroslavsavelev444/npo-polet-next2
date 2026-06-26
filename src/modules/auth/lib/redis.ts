import Redis from 'ioredis'
import { redisConfig } from './redis-config'

export const redis = new Redis({
  ...redisConfig,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
})