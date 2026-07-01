// src/lib/download-vcard.ts
import { Email, Phone } from '../types'
import { createVCard } from './create-vcard'

export function downloadVCard(
  companyName: string,
  phones: Phone[],
  emails: Email[],
  physicalAddress?: string | null
) {
  const vCard = createVCard({
    companyName,
    phones: phones ?? [],
    emails: emails ?? [],
    physicalAddress,
  });

  const blob = new Blob([vCard], { type: 'text/vcard' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${companyName.replace(/\s+/g, '_')}_contacts.vcf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}