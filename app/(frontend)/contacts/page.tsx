// app/contacts/page.tsx

import { getCachedSettings } from "@/payload/services/settings.service";
import {ContactSection}  from "@/modules/contact/components/ContactSection"

export default async function ContactsPage() {
    const settings = await getCachedSettings();

    return <ContactSection settings={settings} />;
}