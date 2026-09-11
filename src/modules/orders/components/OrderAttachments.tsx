import { Download, ExternalLink, FileText, Paperclip } from "lucide-react";
import Image from "next/image";
import type { OrderAttachment } from "../types";
import styles from "./Orders.module.css";

interface OrderAttachmentsProps {
	attachments: OrderAttachment[];
}

const KIND_LABEL: Record<OrderAttachment["kind"], string> = {
	image: "Изображение",
	pdf: "PDF",
	document: "Документ",
};

function formatFileSize(bytes: number | null): string | null {
	if (!bytes || bytes <= 0) return null;
	if (bytes < 1024) return `${bytes} Б`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/**
 * Документы по заказу, приложенные менеджером: счёт на оплату и всё, что
 * появится позже.
 *
 * Два действия на файл, а не одно: открыть в новой вкладке (посмотреть, тот ли
 * это счёт) и скачать (отнести в бухгалтерию). Подписи у обеих кнопок
 * содержат имя файла — десять одинаковых значков подряд иначе неразличимы
 * для скринридера.
 */
export function OrderAttachments({ attachments }: OrderAttachmentsProps) {
	return (
		<section className={styles.block}>
			<div className={styles.blockHead}>
				<h3 className={styles.blockTitle}>
					<Paperclip size={13} aria-hidden />
					Документы
				</h3>
				<p className={styles.blockNote}>{attachments.length}</p>
			</div>

			<ul className={styles.files}>
				{attachments.map((attachment) => {
					const size = formatFileSize(attachment.filesize);
					const meta = [KIND_LABEL[attachment.kind], size]
						.filter(Boolean)
						.join(" · ");

					return (
						<li key={attachment.id} className={styles.file}>
							<span className={styles.filePlate}>
								{attachment.kind === "image" && attachment.previewUrl ? (
									<Image
										src={attachment.previewUrl}
										alt=""
										fill
										sizes="44px"
										className="object-cover"
									/>
								) : (
									<FileText size={18} aria-hidden />
								)}
							</span>

							<div className={styles.fileBody}>
								<p className={styles.fileLabel}>{attachment.label}</p>
								<p className={styles.fileMeta} title={attachment.filename}>
									{attachment.filename} · {meta}
								</p>
							</div>

							<div className={styles.fileActions}>
								<a
									href={attachment.url}
									target="_blank"
									rel="noopener noreferrer"
									aria-label={`Открыть «${attachment.label}» в новой вкладке`}
									className={styles.btnIcon}
								>
									<ExternalLink size={15} aria-hidden />
								</a>
								<a
									href={attachment.url}
									download={attachment.filename}
									aria-label={`Скачать «${attachment.label}»`}
									className={styles.btnIcon}
								>
									<Download size={15} aria-hidden />
								</a>
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

export default OrderAttachments;
