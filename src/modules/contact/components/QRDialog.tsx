// biome-ignore-all lint/performance/noImgElement: изображение — data:-URL,
// собранный в браузере библиотекой qrcode. next/image его не оптимизирует
// (оптимизировать нечего, файла на диске нет) и требует объявления домена,
// которого здесь тоже нет.
"use client";

import { Download } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Modal } from "@/UI";
import { vault as copy } from "../content/contacts-content";
import { createVCard } from "../lib/create-vcard";
import { downloadVCard } from "../lib/download-vcard";
import type { Email, Phone } from "../types";

interface QRDialogProps {
	isOpen: boolean;
	onClose: () => void;
	companyName: string;
	phones: Phone[];
	emails: Email[];
	physicalAddress?: string | null;
}

/**
 * QR-код с полной визитной карточкой (vCard), а не со ссылкой на страницу.
 *
 * Разница принципиальная: ссылка требует интернета и ещё одного действия
 * («открылась страница — теперь сохраните»), vCard в коде добавляет контакт в
 * адресную книгу сразу и работает на объекте без связи.
 *
 * Код рисуется на светлом поле, а не в тёмной теме страницы: сканеры
 * рассчитаны на тёмный рисунок по светлому фону, и инверсия читается заметно
 * хуже — особенно с экрана под углом. Светлая плашка здесь не выпадает из
 * оформления, потому что это и есть предмет: лист с кодом.
 */
export function QRDialog({
	isOpen,
	onClose,
	companyName,
	phones,
	emails,
	physicalAddress,
}: QRDialogProps) {
	const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (!isOpen) return;

		let cancelled = false;
		const vCard = createVCard({
			companyName,
			phones,
			emails,
			physicalAddress,
		});

		QRCode.toDataURL(vCard, {
			width: 512,
			margin: 1,
			color: { dark: "#0D1015", light: "#FFFFFF" },
		})
			.then((url) => {
				if (cancelled) return;
				setQrDataUrl(url);
				setFailed(false);
			})
			.catch(() => {
				if (cancelled) return;
				setQrDataUrl(null);
				setFailed(true);
			});

		return () => {
			cancelled = true;
		};
	}, [isOpen, companyName, phones, emails, physicalAddress]);

	return (
		<Modal
			open={isOpen}
			onClose={onClose}
			title={copy.qr.dialogTitle}
			width={420}
		>
			<div className="flex flex-col items-center gap-5 py-2">
				{failed ? (
					<p className="text-[0.9375rem] text-[var(--text-secondary)]">
						{copy.qr.failed}
					</p>
				) : (
					<>
						{/* Пока код не сгенерирован, место под него занято рамкой
						    того же размера — иначе окно подпрыгивает в момент
						    появления картинки. */}
						<div className="flex size-56 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-white p-3">
							{qrDataUrl ? (
								<img
									src={qrDataUrl}
									alt={`QR-код с контактами «${companyName}»`}
									className="size-full"
								/>
							) : null}
						</div>

						<p className="max-w-[36ch] text-center text-[0.875rem] leading-relaxed text-[var(--text-secondary)]">
							{copy.qr.dialogBody}
						</p>

						<button
							type="button"
							onClick={() => {
								downloadVCard(companyName, phones, emails, physicalAddress);
								onClose();
							}}
							className="group inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-5 py-3 text-[0.9375rem] font-medium text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--border-light)] hover:bg-[var(--surface-hover)]"
						>
							<Download
								className="size-4 transition-transform duration-200 group-hover:translate-y-0.5"
								aria-hidden="true"
							/>
							{copy.vcard.action}
						</button>
					</>
				)}
			</div>
		</Modal>
	);
}
