// components/ConsentItem.tsx
"use client";

import Link from "next/link";
import { ConsentListItem } from "@/modules/auth/types";
import Typography from "@/UI/Typography/Typography";

interface ConsentItemProps {
	consent: ConsentListItem;
	checked: boolean;
	onChange: (slug: string) => void;
	disabled?: boolean;
}

/**
 * Отметка о согласии в форме регистрации.
 *
 * Название ведёт на страницу документа на сайте (/consents/[slug]), а не на
 * файл на Яндекс Диске из documentUrl: там документ разбит на разделы, видно
 * редакцию и дату вступления в силу, а файл скачивается оттуда же одной
 * кнопкой. Внешний сервис посреди регистрации уводил человека с сайта ровно
 * в момент решения.
 *
 * Страница открывается в новой вкладке: уход с формы в той же вкладке
 * стирал бы уже введённые имя, почту и пароль. Для скринридера это сказано
 * явно.
 */
export function ConsentItem({
	consent,
	checked,
	onChange,
	disabled,
}: ConsentItemProps) {
	const { slug, title, isRequired } = consent;

	return (
		<label className="flex items-start gap-2.5 cursor-pointer group">
			<input
				type="checkbox"
				checked={checked}
				onChange={() => onChange(slug)}
				disabled={disabled}
				className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-[var(--primary)]
                   disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
			/>
			<Typography variant="body-sm" color="secondary" className="flex-1">
				{isRequired && (
					<span className="text-[color:var(--error)] mr-1">*</span>
				)}
				{/* Цвет с «!»: глобальное a:not(.button) { color } из Once UI
				    сильнее утилит Tailwind. */}
				<Link
					href={`/consents/${slug}`}
					target="_blank"
					className="!text-[var(--accent)] underline decoration-[color-mix(in_srgb,var(--accent)_40%,transparent)] underline-offset-[0.2em] transition-colors hover:decoration-current"
				>
					{title}
					<span className="sr-only"> (откроется в новой вкладке)</span>
				</Link>
				{isRequired && (
					<span className="ml-1 text-xs text-[color:var(--text-muted)]">
						(обязательно)
					</span>
				)}
			</Typography>
		</label>
	);
}
