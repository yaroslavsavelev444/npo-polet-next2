"use client";

import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Reveal } from "@/shared/components/motion/Reveal";
import { cn } from "@/utils/cn";
import {
	EMAIL_TYPE_LABELS,
	PHONE_TYPE_LABELS,
} from "../content/contacts-content";
import { telHref } from "../lib/format";
import type { Email, Phone } from "../types";
import { MonoLabel } from "./layout";
import { DrawnRule } from "./primitives";

/**
 * Разлинованный список прямых каналов: телефоны, затем почта.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ОДИН СПИСОК, А НЕ ДВЕ КАРТОЧКИ
 * ────────────────────────────────────────────────────────────────────────────
 * Разделение «Телефоны | Email» полезно тому, кто заполняет админку, и
 * бесполезно тому, кто ищет, куда написать по поводу поставки: он ищет не
 * канал, а адресата. Поэтому строки идут одной таблицей, а слева стоит
 * назначение («Отдел продаж», «Техподдержка») — по нему и выбирают.
 *
 * Главный канал помечен точкой, а не плашкой «Основной»: плашка — это ещё
 * одно слово в строке, где и так три текстовых элемента.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КОПИРОВАНИЕ
 * ────────────────────────────────────────────────────────────────────────────
 * navigator.clipboard недоступен вне защищённого контекста и может быть
 * запрещён политикой — тогда кнопка молча ничего не делала бы. Поэтому
 * состояние «скопировано» ставится только по факту успеха, а неудача
 * показывается отдельным состоянием: пользователь должен узнать, что
 * значение придётся выделить вручную.
 */

type ChannelKind = "phone" | "email";

interface ChannelRow {
	kind: ChannelKind;
	label: string;
	value: string;
	href: string;
	description?: string | null;
	isPrimary: boolean;
}

export function ChannelList({
	phones,
	emails,
}: {
	phones: Phone[];
	emails: Email[];
}) {
	const rows: ChannelRow[] = [
		...phones.map<ChannelRow>((phone) => ({
			kind: "phone",
			label: PHONE_TYPE_LABELS[phone.type ?? "other"] ?? "Телефон",
			value: phone.value,
			href: telHref(phone.value),
			description: phone.description,
			isPrimary: Boolean(phone.isPrimary),
		})),
		...emails.map<ChannelRow>((email) => ({
			kind: "email",
			label: EMAIL_TYPE_LABELS[email.type ?? "other"] ?? "Почта",
			value: email.value,
			href: `mailto:${email.value}`,
			description: email.description,
			isPrimary: Boolean(email.isPrimary),
		})),
	];

	return (
		<ul className="m-0 flex list-none flex-col p-0">
			{rows.map((row, index) => (
				<ChannelItem
					key={`${row.kind}-${row.value}`}
					row={row}
					// Шаг каскада маленький намеренно: при 150 мс на семи строках
					// последняя появлялась бы через секунду после первой, и
					// посетитель успевал бы начать читать раньше, чем список
					// собрался.
					delay={index * 70}
					showRule={index > 0}
				/>
			))}
		</ul>
	);
}

type CopyState = "idle" | "copied" | "failed";

function ChannelItem({
	row,
	delay,
	showRule,
}: {
	row: ChannelRow;
	delay: number;
	showRule: boolean;
}) {
	const [copyState, setCopyState] = useState<CopyState>("idle");
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleCopy = useCallback(async () => {
		if (timerRef.current) clearTimeout(timerRef.current);
		try {
			await navigator.clipboard.writeText(row.value);
			setCopyState("copied");
		} catch {
			setCopyState("failed");
		}
		timerRef.current = setTimeout(() => setCopyState("idle"), 2200);
	}, [row.value]);

	return (
		<li>
			{showRule ? <DrawnRule plain delay={delay} /> : null}

			<Reveal
				delay={delay}
				className="channel-row -mx-4 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-[clamp(1rem,2vw,1.5rem)] sm:grid-cols-[minmax(9rem,14rem)_1fr_auto] sm:gap-x-6"
			>
				<div className="flex items-center gap-2 sm:py-1">
					{row.isPrimary ? (
						<span
							className="size-1.5 shrink-0 rounded-full bg-[var(--primary)]"
							// Точка дублирует смысл, который уже несёт порядок
							// строк, — для скринридера это шум.
							aria-hidden="true"
						/>
					) : null}
					<MonoLabel>{row.label}</MonoLabel>
				</div>

				<div className="col-span-2 min-w-0 sm:col-span-1">
					<a
						href={row.href}
						className="channel-row__value break-words text-[clamp(1.125rem,0.95rem+0.85vw,1.75rem)] font-medium leading-tight tracking-[-0.02em] text-[var(--text-primary)] no-underline transition-colors duration-200 hover:text-[var(--primary)] focus-visible:text-[var(--primary)]"
					>
						{row.value}
					</a>
					{row.description ? (
						<p className="mt-1.5 max-w-[42ch] text-[0.8125rem] leading-snug text-[var(--text-muted)]">
							{row.description}
						</p>
					) : null}
				</div>

				<div className="channel-row__tools col-start-2 row-start-1 flex items-center gap-1 justify-self-end sm:col-start-3">
					<button
						type="button"
						onClick={handleCopy}
						aria-label={`Скопировать ${row.value}`}
						className={cn(
							"flex size-9 items-center justify-center rounded-[var(--radius-sm)] border border-transparent text-[var(--text-muted)]",
							"transition-colors duration-200 hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
						)}
					>
						{copyState === "copied" ? (
							<Check
								className="size-4 text-[var(--success)]"
								aria-hidden="true"
							/>
						) : (
							<Copy className="size-4" aria-hidden="true" />
						)}
					</button>

					<a
						href={row.href}
						aria-label={
							row.kind === "phone"
								? `Позвонить по номеру ${row.value}`
								: `Написать на ${row.value}`
						}
						className="flex size-9 items-center justify-center rounded-[var(--radius-sm)] border border-transparent text-[var(--text-muted)] transition-colors duration-200 hover:border-[var(--border)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
					>
						<ArrowUpRight className="size-4" aria-hidden="true" />
					</a>
				</div>

				{/*
				  Результат копирования объявляется вслух и показывается текстом:
				  сменившаяся иконка ничего не сообщает ни скринридеру, ни тому,
				  кто в этот момент смотрел в другое место экрана.
				*/}
				<p
					aria-live="polite"
					className={cn(
						"col-span-2 text-[0.75rem] sm:col-span-3",
						copyState === "idle" && "sr-only",
						copyState === "copied" && "text-[var(--success)]",
						copyState === "failed" && "text-[var(--error)]",
					)}
				>
					{copyState === "copied"
						? "Скопировано"
						: copyState === "failed"
							? "Браузер не дал скопировать — выделите значение вручную"
							: ""}
				</p>
			</Reveal>
		</li>
	);
}
