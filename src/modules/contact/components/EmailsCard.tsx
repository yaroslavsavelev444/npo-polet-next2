// src/components/contacts/EmailsCard.tsx
'use client'

import { useState } from 'react'
import { Mail, Copy, Check } from 'lucide-react'
import { Card } from '@/UI'
import { Heading, Text } from '@/UI/Typography/Typography'
import { Button } from '@/UI'
import type { Email } from '../types'

export function EmailsCard({ emails }: { emails: Email[] }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const handleCopy = (index: number, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleMailTo = (email: Email) => {
    window.open(`mailto:${email.value}`, '_self')
  }

  const primaryEmail = emails.find((e) => e.isPrimary) || emails[0]

  return (
    <Card size="md" className="h-full">
      <Heading level={4} className="!mt-0 mb-4">
        Email
      </Heading>

      <ul className="space-y-3">
        {emails.map((email, index) => (
          <li
            key={index}
            className="flex items-center justify-between gap-4 py-2 border-b border-[var(--border)] last:border-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Аватар */}
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-medium ${
                  email.isPrimary ? 'bg-[var(--success)]' : 'bg-[var(--surface-secondary)]'
                }`}
              >
                {email.type === 'support'
                  ? 'П'
                  : email.type === 'info'
                    ? 'И'
                    : email.type?.charAt(0).toUpperCase() || 'E'}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Text size="sm" className="font-medium truncate">
                    {email.value}
                  </Text>
                  {email.isPrimary && (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-[var(--success)]/10 text-[var(--success)] rounded">
                      Основной
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-[var(--text-muted)] capitalize">
                    {email.type === 'support'
                      ? 'Техподдержка'
                      : email.type === 'info'
                        ? 'Информация'
                        : email.type === 'sales'
                          ? 'Продажи'
                          : email.type || 'Email'}
                  </span>
                  {email.description && (
                    <span className="text-xs text-[var(--text-secondary)] truncate">
                      {email.description}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Кнопка копирования */}
            <button
              onClick={() => handleCopy(index, email.value)}
              className="p-2 rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] transition-colors shrink-0"
              title={copiedIndex === index ? 'Скопировано!' : 'Копировать'}
            >
              {copiedIndex === index ? (
                <Check className="w-4 h-4 text-[var(--success)]" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <Button
          variant="primary"
          fullWidth
          onClick={() => handleMailTo(primaryEmail)}
        >
          <Mail className="w-4 h-4 mr-2" />
          Написать письмо
        </Button>
      </div>
    </Card>
  )
}