import { Queue } from 'bullmq'
import { redisConfig } from './redis-config'

export const queue = new Queue('otp-cleanup', {
  connection: redisConfig,
})