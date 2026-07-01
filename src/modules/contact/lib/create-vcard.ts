// src/lib/create-vcard.ts
import type { Phone, Email } from '../types'

interface VCardParams {
  companyName: string
  phones: Phone[]
  emails: Email[]
  physicalAddress?: string | null
}

export function createVCard({
  companyName,
  phones = [],
  emails = [],
  physicalAddress,
}: VCardParams): string {
  const safePhones = phones ?? [];
  const safeEmails = emails ?? [];
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${companyName}`,
    `ORG:${companyName}`,
    ...safePhones.map((p) => `TEL;TYPE=${p.type || 'other'}:${p.value}`),
    ...safeEmails.map((e) => `EMAIL:${e.value}`),
    physicalAddress ? `ADR:;;${physicalAddress}` : '',
  ].filter(Boolean);
  lines.push('END:VCARD');
  return lines.join('\n');
}
