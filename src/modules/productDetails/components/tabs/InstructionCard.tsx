import { Download, ExternalLink, FileText } from "lucide-react";
import { Card } from "@/UI";
import type { ProductInstructionData } from "../../types";

interface Props {
  instruction: ProductInstructionData;
}

export function InstructionCard({ instruction }: Props) {
  const href =
    instruction.type === "file" ? instruction.fileUrl : instruction.linkUrl;
  if (!href) return null;

  return (
    <Card variant="outlined" size="md">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Инструкция к товару
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {instruction.type === "file"
                ? (instruction.fileName ?? "Файл инструкции")
                : "Внешняя ссылка"}
            </p>
          </div>
        </div>

        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
        >
          {instruction.type === "file" ? (
            <>
              <Download className="h-4 w-4" /> Скачать
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4" /> Открыть
            </>
          )}
        </a>
      </div>
    </Card>
  );
}
