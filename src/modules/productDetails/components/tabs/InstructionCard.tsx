import { Download, ExternalLink, FileText } from "lucide-react";
import { cn } from "@/utils/cn";
import type { ProductInstructionData } from "../../types";

interface Props {
	instruction: ProductInstructionData;
	className?: string;
}

/**
 * Компактный блок с инструкцией к товару. Два сценария:
 *  - «file» — прикреплённый файл (обычно PDF): скачивание, показываем имя и
 *     расширение файла;
 *  - «link» — внешняя ссылка: открываем в новой вкладке, показываем домен.
 * Вся карточка кликабельна — крупная зона нажатия удобна и на тач-устройствах.
 */
export function InstructionCard({ instruction, className }: Props) {
	const isFile = instruction.type === "file";
	const href = isFile ? instruction.fileUrl : instruction.linkUrl;
	if (!href) return null;

	const ActionIcon = isFile ? Download : ExternalLink;
	const actionLabel = isFile ? "Скачать" : "Открыть";
	const subtitle = isFile
		? (instruction.fileName ?? "Файл инструкции")
		: getHostname(href);
	const badge = isFile ? getFileExtension(instruction.fileName) : "Ссылка";

	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			download={isFile || undefined}
			aria-label={`Инструкция к товару — ${actionLabel.toLowerCase()}`}
			className={cn(
				"group flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-light)]",
				"bg-[var(--surface)] p-3 transition-colors hover:border-[var(--primary)]/50 hover:bg-[var(--surface-secondary)]",
				className,
			)}
		>
			<span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)]/10 text-[var(--primary)]">
				<FileText className="h-5 w-5" />
				{badge && (
					<span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--primary)] px-1.5 py-px text-[9px] font-bold uppercase leading-none text-white">
						{badge}
					</span>
				)}
			</span>

			<span className="min-w-0 flex-1">
				<span className="block text-sm font-semibold text-[var(--text-primary)]">
					Инструкция к товару
				</span>
				<span className="block truncate text-xs text-[var(--text-muted)]">
					{subtitle}
				</span>
			</span>

			<span className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs font-medium text-[var(--primary)] transition-colors group-hover:bg-[var(--primary)]/10">
				<ActionIcon className="h-4 w-4" />
				<span className="hidden sm:inline">{actionLabel}</span>
			</span>
		</a>
	);
}

function getFileExtension(fileName: string | null): string | null {
	if (!fileName) return null;
	const match = /\.([a-z0-9]{2,5})$/i.exec(fileName);
	return match ? match[1].toUpperCase() : null;
}

function getHostname(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "Внешняя ссылка";
	}
}
