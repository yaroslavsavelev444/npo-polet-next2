// app/(frontend)/contacts/page.tsx — добавить
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { ContactSection } from "@/modules/contact/components/ContactSection";
import { getCachedSettings } from "@/payload/services/settings.service";
import { baseURL } from "@/resources/content";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCachedSettings();
  const title = "Контакты";
  const description = `Свяжитесь с ${settings?.companyName ?? "нами"}: телефон, email, адрес и социальные сети.`;

  return {
    title,
    description,
    alternates: { canonical: `${baseURL}/contacts` },
    openGraph: {
      title,
      description,
      url: `${baseURL}/contacts`,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ContactsPage() {
  const settings = await getCachedSettings();

  if (!settings) {
    return null;
  }

  return <ContactSection settings={settings} />;
}
