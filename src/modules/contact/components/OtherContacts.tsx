// src/components/contacts/OtherContacts.tsx
import {
  MessageCircle,
  Users,
  Headphones,
  Globe,
  MessageSquare,
} from 'lucide-react'
import { Card } from '@/UI'
import { Heading, Text } from '@/UI/Typography/Typography'
import { Empty } from '@/UI'
import type { OtherContact } from '../types'

const typeIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  messenger: MessageCircle,
  forum: Users,
  bot: Headphones,
  chat: MessageSquare,
  custom: Globe,
}

const typeLabelMap: Record<string, string> = {
  messenger: 'Мессенджер',
  forum: 'Форум',
  bot: 'Бот',
  chat: 'Чат',
  custom: 'Другое',
}

export function OtherContacts({
  otherContacts,
}: {
  otherContacts: OtherContact[]
}) {
  if (otherContacts.length === 0) {
    return (
      <Empty
        message="Другие контакты не настроены"
        description="Возможно, скоро мы добавим дополнительные способы связи с нами."
      />
    )
  }

  return (
    <div className="text-center">
      <Heading level={3} className="mb-8">
        Другие способы связи
      </Heading>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
        {otherContacts.map((contact, index) => {
          const Icon = typeIconMap[contact.type] || Globe
          return (
            <Card
              key={index}
              clickable
              className="!p-4"
            >
              <div className="flex items-center gap-4 text-left">
                <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <Heading level={5} className="!mt-0 mb-1">
                    {contact.name}
                  </Heading>
                  <Text size="sm" color="secondary" className="break-words">
                    {contact.value}
                  </Text>
                  {contact.description && (
                    <Text
                      size="sm"
                      color="muted"
                      className="mt-1 block"
                    >
                      {contact.description}
                    </Text>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}