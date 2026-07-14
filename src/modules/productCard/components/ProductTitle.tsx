/**
 * modules/productCard/components/ProductTitle.tsx
 *
 * Заголовок товара с обрезкой до 2 строк (line-clamp). В старом UI это
 * делал antd Paragraph.ellipsis + Tooltip; здесь — чистый Tailwind
 * line-clamp-2 + нативный title-атрибут для подсказки при наведении
 * (не требует JS, доступнее).
 */

import type { ProductTitleProps } from "../types";

export function ProductTitle({ title }: ProductTitleProps) {
  return (
    <h3
      title={title}
      className="line-clamp-2 min-h-[2.6em] break-words text-sm leading-[1.3] text-[var(--text-secondary)]"
    >
      {title}
    </h3>
  );
}
