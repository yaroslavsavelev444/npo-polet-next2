// app/(frontend)/consents/[slug]/page.tsx

import { Column, Heading, Meta, Schema } from "@once-ui-system/core";
import type { ItemType } from "antd/es/breadcrumb/Breadcrumb";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import { ConsentContent, ConsentDocumentDownload } from "@/modules/consents";
import { getCachedConsentBySlug } from "@/payload/services/consents.service";
import { baseURL } from "@/resources/content";

type ConsentPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ConsentPageProps): Promise<Metadata> {
  const { slug } = await params;
  const consent = await getCachedConsentBySlug(slug);

  if (!consent) {
    return { title: "Соглашение не найдено" };
  }

  return Meta.generate({
    title: consent.title,
    description: consent.description || consent.title,
    baseURL,
    path: `/consents/${slug}`,
    image: "/og/consents.jpg",
  });
}

export default async function ConsentPage({ params }: ConsentPageProps) {
  const { slug } = await params;
  const consent = await getCachedConsentBySlug(slug);

  if (!consent) {
    return notFound();
  }

  const breadcrumbItems: ItemType[] = [
    { title: "Главная", href: "/" },
    { title: "Соглашения", href: "/consents" },
    { title: consent.title },
  ];

  return (
    <Column maxWidth="s" gap="l" paddingY="12" horizontal="center">
      <Schema
        as="webPage"
        baseURL={baseURL}
        path={`/consents/${slug}`}
        title={consent.title}
        description={consent.title}
      />

      <Column fillWidth gap="m">
        <Breadcrumbs items={breadcrumbItems} />

        <Column gap="s">
          <Heading variant="display-strong-s" as="h1">
            {consent.title}
          </Heading>

          <ConsentDocumentDownload
            url={consent.documentUrl}
            // label={consent.documentLabel}
          />
        </Column>
      </Column>

      <ConsentContent consent={consent} />
    </Column>
  );
}
