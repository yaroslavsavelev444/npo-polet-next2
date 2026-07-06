// src/components/consents/ConsentContent.tsx

import type { Consent } from "@/payload-types";
import { splitParagraphs } from "@/utils/splitParagraphs";

interface ConsentContentProps {
  consent: Consent;
}

/**
 * Типографский контейнер под длинные юридические тексты:
 * ограниченная ширина строки (~68ch) для читаемости, разбивка на абзацы
 * по пустой строке, увеличенный line-height, перенос длинных слов/ссылок.
 */
export function ConsentContent({ consent }: ConsentContentProps) {
  const paragraphs = splitParagraphs(consent.content);

  return (
    <article className="mx-auto flex w-full max-w-[68ch] flex-col gap-5">
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          className="whitespace-pre-line break-words text-[0.9375rem] leading-[1.8] text-[var(--text-secondary)]"
        >
          {paragraph}
        </p>
      ))}
    </article>
  );
}
