// src/components/contacts/types.ts
import type { Setting } from '@/payload-types'

export type Phone = NonNullable<Setting['phones']>[number]
export type Email = NonNullable<Setting['emails']>[number]
export type SocialLink = NonNullable<Setting['socialLinks']>[number]
export type OtherContact = NonNullable<Setting['otherContacts']>[number]

export type ContactInfo = {
  companyName: Setting['companyName']
  legalAddress: Setting['legalAddress']
  physicalAddress: Setting['physicalAddress']
  workingHours: Setting['workingHours']
}