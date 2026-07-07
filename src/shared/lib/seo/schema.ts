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
