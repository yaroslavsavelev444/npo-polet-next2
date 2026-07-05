"use client";

import { Button, Column, Flex, Heading, Text } from "@once-ui-system/core";
import { useRouter } from "next/navigation";
import type { ErrorPageProps } from "./../types";
import { ErrorActions } from "./ErrorActions";
import { ErrorIllustration } from "./ErrorIllustration";

export function ErrorPage({
  code,
  title,
  description,
  retry,
  showBackButton = true,
}: ErrorPageProps) {
  const router = useRouter();

  return (
    <Flex
      fillWidth
      minHeight="70vh"
      horizontal="center"
      vertical="center"
      padding="l"
    >
      <Column
        maxWidth="s"
        gap="24"
        horizontal="center"
        style={{ textAlign: "center" }}
      >
        {/* Иллюстрация (можно передать кастомную) */}
        <ErrorIllustration code={code} />

        <Text
          variant="display-default-xl"
          onBackground="brand-strong"
          style={{ fontWeight: 700 }}
        >
          {code}
        </Text>

        <Heading variant="display-default-m">{title}</Heading>

        <Text onBackground="neutral-medium">{description}</Text>

        <ErrorActions
          retry={retry}
          showBackButton={showBackButton}
          onBack={() => router.back()}
        />
      </Column>
    </Flex>
  );
}
