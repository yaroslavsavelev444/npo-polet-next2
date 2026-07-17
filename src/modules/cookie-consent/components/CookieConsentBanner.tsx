"use client";

import { Cookie } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/UI/Button/Button";
import Typography, { Heading } from "@/UI/Typography/Typography";
import { COOKIE_CATEGORIES, COOKIE_POLICY_URL } from "../lib/config";
import {
	selectShouldShowBanner,
	useCookieConsentStore,
} from "../store/cookieConsent.store";

/**
 * Аккуратный неблокирующий баннер согласия на cookie в нижней части экрана.
 *
 * UX-решение (по современным практикам, не «продолжая пользоваться…»):
 *  - «Принять все» и «Только необходимые» — равнозначные явные действия;
 *  - «Настроить» раскрывает тумблеры по категориям (необходимые заблокированы);
 *  - ссылка на политику использования cookie.
 *
 * Не рендерится до гидратации и после сделанного выбора (см. selector). Выбор
 * сохраняется в localStorage — баннер не показывается повторно и переживает
 * перезагрузку.
 */
export function CookieConsentBanner() {
	const shouldShow = useCookieConsentStore(selectShouldShowBanner);
	const acceptAll = useCookieConsentStore((s) => s.acceptAll);
	const acceptEssentialOnly = useCookieConsentStore(
		(s) => s.acceptEssentialOnly,
	);
	const save = useCookieConsentStore((s) => s.save);

	const [showSettings, setShowSettings] = useState(false);
	const [analyticsChecked, setAnalyticsChecked] = useState(true);

	if (!shouldShow) return null;

	return (
		<div
			role="region"
			aria-label="Согласие на использование cookie"
			className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3 sm:p-4"
		>
			<div
				className="w-full max-w-2xl rounded-[var(--radius-lg)] border p-5 shadow-2xl sm:p-6"
				style={{
					background: "var(--surface)",
					borderColor: "var(--border-light)",
					boxShadow: "0 12px 40px var(--shadow-color)",
				}}
			>
				<div className="flex items-start gap-3">
					<span
						aria-hidden
						className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
						style={{ background: "var(--surface-secondary)" }}
					>
						<Cookie className="h-5 w-5" style={{ color: "var(--primary)" }} />
					</span>

					<div className="min-w-0 flex-1">
						<Heading level={5} className="mb-1">
							Мы используем cookie
						</Heading>
						<Typography variant="body-sm" color="secondary">
							Необходимые cookie обеспечивают вход и работу сайта, а
							аналитические (Яндекс.Метрика) помогают делать его удобнее. Вы
							можете принять все cookie или оставить только необходимые.
							Подробнее — в{" "}
							<Link
								href={COOKIE_POLICY_URL}
								className="underline underline-offset-2"
								style={{ color: "var(--link)" }}
							>
								политике использования cookie
							</Link>
							.
						</Typography>
					</div>
				</div>

				{showSettings && (
					<ul
						className="mt-4 flex flex-col gap-2"
						aria-label="Категории cookie"
					>
						{COOKIE_CATEGORIES.map((category) => {
							const checked = category.required ? true : analyticsChecked;
							return (
								<li
									key={category.key}
									className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border p-3"
									style={{
										borderColor: "var(--border-light)",
										background: "var(--surface-secondary)",
									}}
								>
									<div className="min-w-0">
										<Typography variant="body-sm" className="font-medium">
											{category.title}
											{category.required && (
												<span
													className="ml-2 align-middle text-[10px] uppercase tracking-wide"
													style={{ color: "var(--text-muted)" }}
												>
													всегда включены
												</span>
											)}
										</Typography>
										<Typography
											variant="caption"
											color="secondary"
											className="mt-0.5 block"
										>
											{category.description}
										</Typography>
									</div>

									<ConsentToggle
										label={`Cookie: ${category.title}`}
										checked={checked}
										disabled={category.required}
										onChange={
											category.required
												? undefined
												: () => setAnalyticsChecked((v) => !v)
										}
									/>
								</li>
							);
						})}
					</ul>
				)}

				<div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
					{!showSettings && (
						<Button
							variant="ghost"
							size="md"
							fullWidth
							className="sm:w-auto sm:mr-auto"
							onClick={() => setShowSettings(true)}
						>
							Настроить
						</Button>
					)}

					{showSettings ? (
						<Button
							variant="primary"
							size="md"
							fullWidth
							className="sm:w-auto"
							onClick={() => save({ analytics: analyticsChecked })}
						>
							Сохранить выбор
						</Button>
					) : (
						<>
							<Button
								variant="outline"
								size="md"
								fullWidth
								className="sm:w-auto"
								onClick={acceptEssentialOnly}
							>
								Только необходимые
							</Button>
							<Button
								variant="primary"
								size="md"
								fullWidth
								className="sm:w-auto"
								onClick={acceptAll}
							>
								Принять все
							</Button>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

interface ConsentToggleProps {
	label: string;
	checked: boolean;
	disabled?: boolean;
	onChange?: () => void;
}

/** Доступный тумблер (role="switch") для категории cookie. */
function ConsentToggle({
	label,
	checked,
	disabled,
	onChange,
}: ConsentToggleProps) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			onClick={onChange}
			className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-70"
			style={{
				background: checked ? "var(--primary)" : "var(--border-light)",
			}}
		>
			<span
				className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
				style={{ transform: checked ? "translateX(24px)" : "translateX(4px)" }}
			/>
		</button>
	);
}
