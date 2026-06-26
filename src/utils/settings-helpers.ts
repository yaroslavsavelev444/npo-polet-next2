// services/Setting.helpers.ts
import type { Setting } from '@/payload-types'

/**
 * Получить первый телефон из массива phones
 * Сначала ищет с isPrimary: true, затем первый в массиве
 */
export function getPrimaryPhone(Setting: Setting | null): string | null {
  if (!Setting?.phones || Setting.phones.length === 0) return null
  const primary = Setting.phones.find(p => p.isPrimary === true)
  return primary?.value || Setting.phones[0]?.value || null
}

/**
 * Получить первый email из массива emails
 * Сначала ищет с isPrimary: true, затем первый в массиве
 */
export function getPrimaryEmail(Setting: Setting | null): string | null {
  if (!Setting?.emails || Setting.emails.length === 0) return null
  const primary = Setting.emails.find(e => e.isPrimary === true)
  return primary?.value || Setting.emails[0]?.value || null
}

/**
 * Получить название компании
 */
export function getCompanyName(Setting: Setting | null): string | null {
  return Setting?.companyName || null
}

/**
 * Получить URL логотипа (если есть media)
 */
export function getLogoUrl(Setting: Setting | null): string | null {
  if (!Setting?.logo) return null
  const logo = Setting.logo as any
  if (typeof logo === 'object' && logo?.url) {
    return logo.url
  }
  return null
}

/**
 * Получить массив социальных ссылок с сортировкой по sortOrder
 */
export function getSocialLinks(Setting: Setting | null): Array<{ platform: string; url: string; title?: string | null }> {
  if (!Setting?.socialLinks) return []
  return Setting.socialLinks
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(({ platform, url, title }) => ({ platform, url, title: title ?? null }))
}

/**
 * Получить рабочие часы
 */
export function getWorkingHours(Setting: Setting | null): string | null {
  return Setting?.workingHours || null
}

/**
 * Получить юридический адрес
 */
export function getLegalAddress(Setting: Setting | null): string | null {
  return Setting?.legalAddress || null
}

/**
 * Получить физический адрес
 */
export function getPhysicalAddress(Setting: Setting | null): string | null {
  return Setting?.physicalAddress || null
}