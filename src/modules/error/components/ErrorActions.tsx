"use client";

import { Button, Flex } from "@once-ui-system/core";

type ErrorActionsProps = {
  retry?: () => void;
  showBackButton?: boolean;
  onBack?: () => void;
};

export function ErrorActions({
  retry,
  showBackButton,
  onBack,
}: ErrorActionsProps) {
  return (
    <Flex gap="16" wrap={true} horizontal="center">
      <Button href="/" prefixIcon="home">
        На главную
      </Button>

      {showBackButton && onBack && (
        <Button variant="secondary" onClick={onBack} prefixIcon="arrowLeft">
          Назад
        </Button>
      )}

      {retry && (
        <Button variant="secondary" onClick={retry} prefixIcon="refresh">
          Повторить
        </Button>
      )}
    </Flex>
  );
}
