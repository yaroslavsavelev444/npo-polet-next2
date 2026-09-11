import { Download, ExternalLink, FileText } from "lucide-react";
import { cn } from "@/utils/cn";
import type { ProductInstructionData } from "../types";
import styles from "./ProductPage.module.css";

interface Props {
	instruction: ProductInstructionData;
	className?: string;
}

/**
 * Инструкция к товару — строка в блоке покупки. Два сценария:
 *  - «file» — прикреплённый файл (обычно PDF): скачивание, показываем имя и
 *    расширение файла;
 *  - «link» — внешняя ссылка: открываем в новой вкладке, показываем домен.
 *
 * Это строка той же таблицы, что и условия поставки: собственной рамки нет,
 * отделяет её волосяная линия сверху. Кликабельна вся строка — крупная зона
 * нажатия удобна и на тач-устройствах. Стрелка действия сдвигается при
 * наведении: направление жеста подсказывает, что произойдёт (уход из
 * страницы), и это единственная микроанимация строки.
 */
export function ProductInstructionLink({ instruction, className }: Props) {
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
			className={cn(styles.instruction, className)}
		>
			<span className={styles.instructionMark}>
				<FileText className="h-4 w-4" aria-hidden="true" />
				{badge && <span className={styles.instructionBadge}>{badge}</span>}
			</span>

			<span className="min-w-0 flex-1">
				<span className="block text-[0.8125rem] font-semibold text-[var(--text-primary)]">
					Инструкция к товару
				</span>
				<span className="block truncate text-xs text-[var(--text-muted)]">
					{subtitle}
				</span>
			</span>

			<span className={styles.instructionAction}>
				<ActionIcon className="h-4 w-4" aria-hidden="true" />
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
