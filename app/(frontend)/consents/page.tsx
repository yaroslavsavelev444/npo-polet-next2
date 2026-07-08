// app/(frontend)/consents/page.tsx
import { Column, Heading, Meta, Schema, Text } from "@once-ui-system/core";
import { AutoBreadcrumbs } from "@/components/Breadcrumbs/AutoBreadcrumbs";
import { ConsentsList } from "@/modules/consents";
import { baseURL } from "@/resources/content";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return Meta.generate({
    title: "Соглашения",
    description:
      "Пользовательские соглашения и документы о согласии на обработку данных.",
    baseURL,
    path: "/consents",
    image: "/og/consents.jpg",
  });
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
