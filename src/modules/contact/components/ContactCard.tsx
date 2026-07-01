// src/components/contacts/ContactCard.tsx
import { Card } from '@/UI'
import { Heading, Text } from '@/UI/Typography/Typography'
import { Building2, MapPin, Clock } from 'lucide-react'
import { ContactInfo } from '../types'

export function ContactCard({
  companyName,
  legalAddress,
  physicalAddress,
  workingHours,
}: ContactInfo) {
  return (
    <Card variant="default" size="md" className="h-full">
      {/* Заголовок с иконкой */}
      <div className="flex items-center gap-4 mb-6 flex-col md:flex-row md:text-left text-center">
        <div className="w-12 h-12 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] shrink-0">
          <Building2 className="w-6 h-6" />
        </div>
        <div>
          <Heading level={3} className="!mt-0 mb-1">
            {companyName}
          </Heading>
          <Text color="secondary">Организация</Text>
        </div>
      </div>

      {/* Адреса */}
      {(physicalAddress || legalAddress) && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4 text-[var(--text-secondary)]" />
            <Heading level={5} className="!mt-0">
              Адреса
            </Heading>
          </div>
          <div className="space-y-2">
            {physicalAddress && (
              <div>
                <Text size="sm" className="font-medium block mb-1">
                  Фактический адрес:
                </Text>
                <Text size="sm" color="secondary">
                  {physicalAddress}
                </Text>
              </div>
            )}
            {legalAddress && (
              <div>
                <Text size="sm" className="font-medium block mb-1">
                  Юридический адрес:
                </Text>
                <Text size="sm" color="secondary">
                  {legalAddress}
                </Text>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Часы работы */}
      {workingHours && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-[var(--text-secondary)]" />
            <Heading level={5} className="!mt-0">
              Часы работы
            </Heading>
          </div>
          <Text size="sm" color="secondary">
            {workingHours}
          </Text>
        </div>
      )}
    </Card>
  )
}