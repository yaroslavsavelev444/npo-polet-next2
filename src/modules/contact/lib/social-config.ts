// src/lib/social-config.ts
import type { LucideIcon } from 'lucide-react'
import {
  MessageCircle,
  Send,
  Globe,
  MessageSquare,
} from 'lucide-react'

export interface SocialConfigItem {
  platform: string
  color: string
  icon: LucideIcon
}

export const socialConfig: Record<string, SocialConfigItem> = {
  telegram: {
    platform: 'telegram',
    color: '#0088cc',
    icon: Send,
  },
  whatsapp: {
    platform: 'whatsapp',
    color: '#25D366',
    icon: MessageCircle,
  },
  vk: {
    platform: 'vk',
    color: '#4C75A3',
    icon: MessageSquare,
  },

  max: {
    platform: 'max',
    color: '#5930ff',
    icon: Globe,
  },
  other: {
    platform: 'other',
    color: '#6b7280',
    icon: Globe,
  },
}