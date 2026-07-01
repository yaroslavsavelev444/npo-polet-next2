/**
 * modules/productCard/components/ProductTitle.tsx
 *
 * Заголовок товара с обрезкой до 2 строк (line-clamp). В старом UI это
 * делал antd Paragraph.ellipsis + Tooltip; здесь — чистый Tailwind
 * line-clamp-2 + нативный title-атрибут для подсказки при наведении
 * (не требует JS, доступнее).
 */

import { Text } from "@once-ui-system/core";
import type { ProductTitleProps } from "../types";

export function ProductTitle({ title }: ProductTitleProps) {
  return (
    <Text
      as="h3"
      variant="body-default-m"
      onBackground="neutral-strong"
      title={title}
      className="line-clamp-2 min-h-[2.6em] break-words"
    >
      {title}
    </Text>
  );
}
