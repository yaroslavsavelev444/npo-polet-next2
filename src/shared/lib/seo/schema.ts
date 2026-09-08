// src/shared/lib/seo/schema.ts
import type { Setting } from "@/payload-types";
import { baseURL } from "@/resources/content";

export function buildOrganizationSchema(settings: Setting | null) {
  const logoUrl =
    typeof settings?.logo === "object" ? settings.logo?.url : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings?.companyName ?? "НПО Полёт",
    url: baseURL,
    ...(logoUrl ? { logo: logoUrl } : {}),
    ...(settings?.legalAddress
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: settings.legalAddress,
          },
        }
      : {}),
    ...(settings?.phones?.length
      ? {
          contactPoint: [
            {
              "@type": "ContactPoint",
              telephone: settings.phones[0].value,
              contactType: "customer service",
            },
          ],
        }
      : {}),
    sameAs: (settings?.socialLinks ?? []).map((link) => link.url),
  };
}

export function buildWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "НПО Полёт",
    url: baseURL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${baseURL}/category?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildBreadcrumbSchema(
  items: Array<{ title: string; href?: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.title,
      ...(item.href ? { item: `${baseURL}${item.href}` } : {}),
    })),
  };
}

/**
 * Разметка страницы контактов.
 *
 * ContactPage с вложенной Organization, а не отдельная Organization: на сайте
 * уже есть Organization в корневом layout (buildOrganizationSchema), и вторая
 * такая же сущность на этой же странице конкурировала бы с ней. Здесь
 * организация — предмет страницы, поэтому она вложена как `mainEntity`.
 *
 * contactPoint строится по ВСЕМ телефонам и адресам почты, а не только по
 * основному: назначение канала (продажи, поддержка) — это ровно то, что
 * поисковик показывает в расширенном сниппете, и разные строки для разных
 * отделов там полезны.
 */
export function buildContactPageSchema(settings: Setting, pageUrl: string) {
  const contactPoints = [
    ...(settings.phones ?? []).map((phone) => ({
      "@type": "ContactPoint",
      telephone: phone.value,
      contactType: phone.type ?? "customer service",
      ...(phone.description ? { description: phone.description } : {}),
    })),
    ...(settings.emails ?? []).map((email) => ({
      "@type": "ContactPoint",
      email: email.value,
      contactType: email.type ?? "customer service",
      ...(email.description ? { description: email.description } : {}),
    })),
  ];

  const address = settings.physicalAddress ?? settings.legalAddress;

  return {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    url: pageUrl,
    name: `Контакты — ${settings.companyName}`,
    mainEntity: {
      "@type": "Organization",
      name: settings.companyName,
      url: baseURL,
      ...(address
        ? {
            address: {
              "@type": "PostalAddress",
              streetAddress: address,
            },
          }
        : {}),
      ...(settings.workingHours
        ? { openingHours: settings.workingHours }
        : {}),
      ...(contactPoints.length ? { contactPoint: contactPoints } : {}),
      sameAs: (settings.socialLinks ?? []).map((link) => link.url),
    },
  };
}
