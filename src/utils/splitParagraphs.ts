// src/utils/splitParagraphs.ts

/**
 * Разбивает текст на абзацы по двойным переносам строки.
 * Одиночные переносы внутри абзаца сохраняются на стороне рендера
 * через `white-space: pre-line`.
 */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
