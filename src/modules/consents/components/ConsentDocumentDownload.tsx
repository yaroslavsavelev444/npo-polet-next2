// src/components/consents/ConsentDocumentDownload.tsx
import { Button } from "@once-ui-system/core";
import { Download } from "lucide-react";

interface ConsentDocumentDownloadProps {
  url?: string | null;
  label?: string | null;
}

/**
 * Кнопка скачивания документа соглашения.
 *
 * Файл не хранится в проекте — только URL, который указывает администратор
 * в Payload (`documentUrl`). Сегодня это может быть произвольная ссылка,
 * в перспективе — ссылка на Яндекс.Диск, поэтому компонент не делает
 * никаких предположений о происхождении файла и просто открывает
 * его в новой вкладке. Рендерит null, если ссылка не указана — страница
 * соглашения корректно работает и без файла.
 */
export function ConsentDocumentDownload({
  url,
  label,
}: ConsentDocumentDownloadProps) {
  if (!url) return null;

  return (
    <Button
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      variant="primary"
      size="m"
      className="flex w-fit items-center gap-2"
    >
      <Download size={16} strokeWidth={2} />
      {label || "Скачать документ"}
    </Button>
  );
}
