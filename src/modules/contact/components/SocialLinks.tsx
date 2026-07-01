// src/components/contacts/SocialLinks.tsx
'use client'

import { ArrowRight } from 'lucide-react'
import { Heading, Text } from '@/UI/Typography/Typography'
import { Empty } from '@/UI'
import { socialConfig } from '../lib/social-config'
import type { SocialLink } from '../types'

export function SocialLinks({ socialLinks }: { socialLinks: SocialLink[] }) {
  if (socialLinks.length === 0) {
    return (
      <Empty
        message="Социальные сети не настроены"
        description="Следите за обновлениями, скоро мы добавим ссылки на наши социальные сети."
      />
    )
  }

  const handleClick = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="text-center">
      <Heading level={3} className="mb-8">
        Мы в социальных сетях
      </Heading>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl mx-auto">
        {socialLinks.map((link, index) => {
          const config = socialConfig[link.platform] || socialConfig.other
          const Icon = config.icon

          return (
            <button
              key={index}
              onClick={() => handleClick(link.url)}
              className="flex items-center gap-3 px-5 py-4 rounded-[var(--radius-md)] border transition-all hover:shadow-md text-left group"
              style={{
                backgroundColor: `${config.color}10`,
                borderColor: `${config.color}30`,
                color: config.color,
              }}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="flex-1 text-sm font-medium">
                {link.title ||
                  (link.platform === 'telegram'
                    ? 'Telegram'
                    : link.platform === 'vk'
                      ? 'ВКонтакте'
                      : link.platform === 'whatsapp'
                        ? 'WhatsApp'
                        : link.platform === 'github'
                          ? 'GitHub'
                          : link.platform === 'max'
                            ? 'Макс'
                            : link.platform?.charAt(0).toUpperCase() + link.platform?.slice(1))}
              </span>
              <ArrowRight className="w-4 h-4 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
            </button>
          )
        })}
      </div>

      <Text color="secondary" className="mt-8">
        Подпишитесь на нас, чтобы быть в курсе новостей и акций
      </Text>
    </div>
  )
}