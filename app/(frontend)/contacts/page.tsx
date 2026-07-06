// app/contacts/page.tsx

import { ContactSection } from "@/modules/contact/components/ContactSection";
import { getCachedSettings } from "@/payload/services/settings.service";

export default async function ContactsPage() {
  const settings = await getCachedSettings();

  if (!settings) {
    return null;
  }

  return <ContactSection settings={settings} />;
}
