'use client'

import { useState } from 'react'
import { Phone, Copy, Check } from 'lucide-react'
import { Button, Card } from '@/UI'
import { Heading, Text } from '@/UI/Typography/Typography'
import type { Phone as PhoneType } from '../types'

export function PhonesCard({ phones }: { phones: PhoneType[] }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const handleCopy = (index: number, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleCall = (phone: PhoneType) => {
    window.open(`tel:${phone.value.replace(/\D/g, '')}`, '_self')
  }

  const primaryPhone = phones.find((p) => p.isPrimary) || phones[0]

  return (
    <Card size="md" className="h-full">
      <Heading level={4} className="!mt-0 mb-4">
        Телефоны
      </Heading>

      <ul className="space-y-3">
        {phones.map((phone, index) => (
          <li
            key={index}
            className="flex items-center justify-between gap-4 py-2 border-b border-[var(--border)] last:border-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Аватар-иконка */}
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-medium ${
                  phone.isPrimary ? 'bg-[var(--success)]' : 'bg-[var(--surface-secondary)]'
                }`}
              >
                {phone.type === 'support'
                  ? 'П'
                  : phone.type === 'sales'
                    ? 'ПР'
                    : phone.type?.charAt(0).toUpperCase() || 'Т'}
              </div>

              {/* Информация */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Text size="sm" className="font-medium truncate">
                    {phone.value}
                  </Text>
                  {phone.isPrimary && (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-[var(--success)]/10 text-[var(--success)] rounded">
                      Основной
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-[var(--text-muted)] capitalize">
                    {phone.type === 'support'
                      ? 'Техподдержка'
                      : phone.type === 'sales'
                        ? 'Продажи'
                        : phone.type === 'general'
                          ? 'Общий'
                          : phone.type || 'Телефон'}
                  </span>
                  {phone.description && (
                    <span className="text-xs text-[var(--text-secondary)] truncate">
                      {phone.description}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Кнопка копирования */}
            <button
              onClick={() => handleCopy(index, phone.value)}
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

      {/* Кнопка звонка */}
      <div className="mt-4">
        <Button
          variant="primary"
          fullWidth
          onClick={() => handleCall(primaryPhone)}
        >
          <Phone className="w-4 h-4 mr-2" />
          Позвонить
        </Button>
      </div>
    </Card>
  )
}