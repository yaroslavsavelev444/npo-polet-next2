import { Download, ExternalLink, FileText, Paperclip } from "lucide-react";
import Image from "next/image";
import type { OrderAttachment } from "../types";
import { ORDER_CARD_CLASS } from "./orderCard.styles";

interface OrderAttachmentsProps {
	attachments: OrderAttachment[];
}

const KIND_LABEL: Record<OrderAttachment["kind"], string> = {
	image: "Изображение",
	pdf: "PDF-документ",
	document: "Документ",
};

function formatFileSize(bytes: number | null): string | null {
	if (!bytes || bytes <= 0) return null;
	if (bytes < 1024) return `${bytes} Б`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function AttachmentActions({ attachment }: { attachment: OrderAttachment }) {
	return (
		<div className="flex shrink-0 items-center gap-1.5">
			<a
				href={attachment.url}
				target="_blank"
				rel="noopener noreferrer"
				aria-label={`Открыть: ${attachment.filename}`}
				className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-light)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-light)]"
			>
				<ExternalLink size={15} aria-hidden />
			</a>
			<a
				href={attachment.url}
				download={attachment.filename}
				aria-label={`Скачать: ${attachment.filename}`}
				className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-light)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-light)]"
			>
				<Download size={15} aria-hidden />
			</a>
		</div>
	);
}

function AttachmentRow({ attachment }: { attachment: OrderAttachment }) {
	const size = formatFileSize(attachment.filesize);
	const typeLabel = KIND_LABEL[attachment.kind];

	return (
		<div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--surface-secondary)]/40 p-2.5 sm:p-3">
			{/* Превью изображения или иконка типа файла */}
			<div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-secondary)]">
				{attachment.kind === "image" && attachment.previewUrl ? (
					<Image
						src={attachment.previewUrl}
						alt={attachment.label}
						fill
						sizes="56px"
						className="object-cover"
					/>
				) : (
					<FileText
						size={22}
						className="text-[var(--text-secondary)]"
						aria-hidden
					/>
				)}
			</div>

			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium text-[var(--text-primary)]">
					{attachment.label}
				</p>
				<p className="truncate text-xs text-[var(--text-secondary)]">
					{attachment.filename}
				</p>
				<p className="mt-0.5 text-xs text-[var(--text-muted)]">
					{[typeLabel, size].filter(Boolean).join(" · ")}
				</p>
			</div>

			<AttachmentActions attachment={attachment} />
		</div>
	);
}

/**
 * Вложения, прикреплённые администратором (счёт, изображения, документы).
 * Изображения показываются с превью, документы — с иконкой типа. У каждого
 * вложения — открыть и скачать. Блок не рендерится, если вложений нет.
 */
export function OrderAttachments({ attachments }: OrderAttachmentsProps) {
	if (attachments.length === 0) return null;

	return (
		<section className={`p-4 sm:p-5 ${ORDER_CARD_CLASS}`}>
			<h3 className="mb-3.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
				<Paperclip size={13} aria-hidden />
				Вложения
			</h3>
			<div className="flex flex-col gap-2.5">
				{attachments.map((attachment) => (
					<AttachmentRow key={attachment.id} attachment={attachment} />
				))}
			</div>
		</section>
	);
}
