// app/(frontend)/consents/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Column, Heading, Meta, Schema, Text } from "@once-ui-system/core";
import { AutoBreadcrumbs } from "@/components/Breadcrumbs/AutoBreadcrumbs";
import { ConsentsList } from "@/modules/consents";
import { baseURL } from "@/resources/content";

export async function generateMetadata() {
  // Картинки превью у раздела нет: прежний /og/consents.jpg в проекте не
  // существует (404), а без image Meta.generate подставляет /api/og/generate —
  // такого маршрута тоже нет. Поэтому images из его результата убираем.
  // Canonical Meta.generate проставляет только вместе с hreflang-альтернативами,
  // поэтому задаётся здесь явно — как на остальных публичных страницах.
  const { openGraph, twitter, ...meta } = Meta.generate({
    title: "Соглашения",
    description:
      "Пользовательские соглашения и документы о согласии на обработку данных.",
    baseURL,
    path: "/consents",
  });

  return {
    ...meta,
    openGraph: { ...openGraph, images: undefined },
    twitter: { ...twitter, images: undefined },
    alternates: { canonical: `${baseURL}/consents` },
  };
}

export default function ConsentsPage() {
  return (
    <Column maxWidth="s" gap="l" paddingY="12" horizontal="center">
      <Schema
        as="webPage"
        baseURL={baseURL}
        path="/consents"
        title="Соглашения"
        description="Пользовательские соглашения и документы о согласии на обработку данных"
      />

      <Column fillWidth gap="m">
        <AutoBreadcrumbs />

        <Column gap="xs">
          <Heading variant="display-strong-s" as="h1">
            Соглашения
          </Heading>
          <Text variant="body-default-m" onBackground="neutral-weak">
            Документы, регулирующие использование сайта и обработку персональных
            данных.
          </Text>
        </Column>
      </Column>

      <ConsentsList />
    </Column>
  );
}
