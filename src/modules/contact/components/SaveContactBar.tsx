"use client";

import { Check, Download, QrCode, Share2 } from "lucide-react";
import { useState } from "react";
import { Reveal } from "@/shared/components/motion/Reveal";
import { vault as copy } from "../content/contacts-content";
import { downloadVCard } from "../lib/download-vcard";
import { shareContact } from "../lib/share-contact";
import type { Email, Phone } from "../types";
import { Container, MonoLabel, Section } from "./layout";
import { DrawnRule } from "./primitives";
import { QRDialog } from "./QRDialog";

interface SaveContactBarProps {
	companyName: string;
	phones: Phone[];
	emails: Email[];
	physicalAddress?: string | null;
}

/**
 * Полоса «сохранить контакт»: QR, vCard, поделиться.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ПОЛОСА, А НЕ ТРИ КАРТОЧКИ
 * ────────────────────────────────────────────────────────────────────────────
 * Это служебные действия: ими пользуются один раз и не все. Раньше они стояли
 * тремя одинаковыми блоками высотой с телефонный номер — и по весу на странице
 * спорили с самими контактами, ради которых сюда приходят. Полоса из трёх
 * текстовых действий с разделителями оставляет их доступными и возвращает им
 * их настоящий вес.
 *
 * Все три действия работают только в браузере (Clipboard, Blob, Web Share),
 * поэтому компонент клиентский целиком.
 */
export function SaveContactBar({
	companyName,
	phones,
	emails,
	physicalAddress,
}: SaveContactBarProps) {
	const [qrOpen, setQrOpen] = useState(false);
	const [shareState, setShareState] = useState<"idle" | "copied">("idle");

	// Нечего сохранять — нечего и показывать.
	if (phones.length === 0 && emails.length === 0) return null;

	const handleShare = async () => {
		const result = await shareContact(companyName);
		if (result === "copied") {
			setShareState("copied");
			setTimeout(() => setShareState("idle"), 2400);
		}
	};

	return (
		<Section id="save">
			<Container className="pb-[clamp(3.5rem,7vw,6rem)] pt-[clamp(2rem,4vw,3.5rem)]">
				<DrawnRule />

				<div className="mt-[clamp(1.5rem,3vw,2.25rem)] flex flex-col gap-[clamp(1.25rem,2.5vw,2rem)] lg:flex-row lg:items-center lg:justify-between">
					<Reveal>
						<div className="flex flex-col gap-2">
							<MonoLabel>{copy.heading}</MonoLabel>
							<p className="text-[0.9375rem] text-[var(--text-secondary)]">
								{copy.intro}
							</p>
						</div>
					</Reveal>

					<Reveal delay={120}>
						<div className="flex flex-wrap items-stretch gap-x-1 gap-y-2">
							<VaultAction
								icon={<QrCode className="size-4" aria-hidden="true" />}
								label={copy.qr.action}
								hint={copy.qr.hint}
								onClick={() => setQrOpen(true)}
							/>
							<Divider />
							<VaultAction
								icon={<Download className="size-4" aria-hidden="true" />}
								label={copy.vcard.action}
								hint={copy.vcard.hint}
								onClick={() =>
									downloadVCard(companyName, phones, emails, physicalAddress)
								}
							/>
							<Divider />
							<VaultAction
								icon={
									shareState === "copied" ? (
										<Check
											className="size-4 text-[var(--success)]"
											aria-hidden="true"
										/>
									) : (
										<Share2 className="size-4" aria-hidden="true" />
									)
								}
								label={copy.share.action}
								hint={
									shareState === "copied" ? copy.share.copied : copy.share.hint
								}
								onClick={handleShare}
							/>
						</div>
					</Reveal>
				</div>
			</Container>

			<QRDialog
				isOpen={qrOpen}
				onClose={() => setQrOpen(false)}
				companyName={companyName}
				phones={phones}
				emails={emails}
				physicalAddress={physicalAddress}
			/>
		</Section>
	);
}

function Divider() {
	return (
		<span
			className="my-2 hidden w-px self-stretch bg-[var(--rule)] sm:block"
			aria-hidden="true"
		/>
	);
}

function VaultAction({
	icon,
	label,
	hint,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	hint: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group flex items-center gap-3 rounded-[var(--radius-sm)] px-4 py-3 text-left transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--primary)_7%,transparent)]"
		>
			<span className="text-[var(--text-muted)] transition-colors duration-200 group-hover:text-[var(--primary)]">
				{icon}
			</span>
			<span className="flex flex-col gap-0.5">
				<span className="text-[0.9375rem] font-medium leading-none text-[var(--text-primary)]">
					{label}
				</span>
				{/*
				  Подсказка меняется на «Ссылка скопирована» — это результат
				  действия, и о нём нужно сообщить вслух: иконка, сменившаяся на
				  галочку, скринридеру ничего не говорит.
				*/}
				<span
					aria-live="polite"
					className="text-[0.75rem] leading-none text-[var(--text-muted)]"
				>
					{hint}
				</span>
			</span>
		</button>
	);
}
