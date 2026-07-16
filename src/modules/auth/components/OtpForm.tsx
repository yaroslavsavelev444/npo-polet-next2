"use client";

import { ClipboardPaste } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import Button from "@/UI/Button/Button";
import Card from "@/UI/Card/Card";
import Typography, { Heading } from "@/UI/Typography/Typography";
import { resendOtpAction } from "../actions/resendOtp";
import { verifyOtpAction } from "../actions/verifyOtp";
import type { OtpType } from "../types";
import { AuthAlert } from "./AuthAlert";
import { CodeInput } from "./CodeInput";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;
const EMPTY_CODE = " ".repeat(OTP_LENGTH);

interface OtpFormProps {
	type: OtpType;
	email: string;
	title: string;
	description: string;
}

/**
 * Форма ввода OTP-кода.
 * Используется и для подтверждения входа (login_2fa),
 * и для верификации email (email_verify).
 *
 * Автофокус + автосабмит при вводе 6 цифр, поддержка вставки (Ctrl/Cmd+V,
 * контекстное меню, кнопка «Вставить из буфера»), автозаполнение OTP на
 * мобильных (autoComplete="one-time-code").
 */
export function OtpForm({ type, email, title, description }: OtpFormProps) {
	const formRef = useRef<HTMLFormElement>(null);

	const [code, setCode] = useState(EMPTY_CODE);
	const [shakeSignal, setShakeSignal] = useState(0);
	const [cooldown, setCooldown] = useState(0);
	const [clipboardError, setClipboardError] = useState<string | null>(null);

	const [verifyState, verifyAction, isVerifying] = useActionState(
		verifyOtpAction,
		null,
	);
	const [resendState, resendAction, isResending] = useActionState(
		resendOtpAction,
		null,
	);

	const compactCode = code.replace(/\s/g, "");

	// Редиректа здесь нет: verifyOtpAction при успехе сам делает redirect() уже
	// после того, как выставил cookies, и приносит свежее RSC-дерево (иначе
	// Navbar остаётся отрисованным для гостя, см. комментарий в verifyOtp.ts).
	// Поэтому verifyState здесь бывает только ошибкой.

	// Неверный код — очищаем поля, трясём группу и возвращаем фокус на первую ячейку
	useEffect(() => {
		if (verifyState && !verifyState.success) {
			setCode(EMPTY_CODE);
			setShakeSignal((n) => n + 1);
		}
	}, [verifyState]);

	// Кулдаун повторной отправки: стартует сразу (код только что отправлен
	// предыдущим шагом) и перезапускается при каждой успешной пересылке —
	// защищает от случайного двойного клика, не дублируя серверный rate-limit.
	useEffect(() => {
		setCooldown(RESEND_COOLDOWN_SECONDS);
	}, []);

	useEffect(() => {
		if (resendState?.success) {
			setCode(EMPTY_CODE);
			setCooldown(RESEND_COOLDOWN_SECONDS);
		}
	}, [resendState]);

	useEffect(() => {
		if (cooldown <= 0) return;
		const timer = setInterval(
			() => setCooldown((c) => Math.max(0, c - 1)),
			1000,
		);
		return () => clearInterval(timer);
	}, [cooldown]);

	function handleComplete() {
		// Небольшая задержка — пользователь успевает увидеть введённую цифру
		setTimeout(() => formRef.current?.requestSubmit(), 100);
	}

	async function handlePasteFromClipboard() {
		setClipboardError(null);

		if (!navigator.clipboard?.readText) {
			setClipboardError(
				"Автовставка недоступна в этом браузере. Вставьте код вручную (Cmd/Ctrl+V).",
			);
			return;
		}

		try {
			const text = await navigator.clipboard.readText();
			const digits = text.replace(/\D/g, "").slice(0, OTP_LENGTH);
			if (!digits) {
				setClipboardError("В буфере обмена нет кода подтверждения.");
				return;
			}
			setCode(digits.padEnd(OTP_LENGTH, " "));
		} catch (err) {
			setClipboardError(
				err instanceof DOMException && err.name === "NotAllowedError"
					? "Нет доступа к буферу обмена. Разрешите доступ в настройках браузера или вставьте код вручную."
					: "Не удалось прочитать буфер обмена. Вставьте код вручную.",
			);
		}
	}

	const maskedEmail = maskEmail(email);

	return (
		<div className="w-full max-w-md mx-auto animate-[fade-in-up_300ms_ease-out]">
			<Card variant="elevated" size="lg">
				<div className="mb-6 text-center">
					<Heading level={1} className="mb-1.5">
						{title}
					</Heading>
					<Typography variant="body-sm" color="secondary">
						{description}{" "}
						<span className="font-medium text-[var(--text-primary)]">
							{maskedEmail}
						</span>
					</Typography>
				</div>

				<form ref={formRef} action={verifyAction} className="space-y-5">
					<input type="hidden" name="type" value={type} />
					<input type="hidden" name="code" value={compactCode} readOnly />

					{verifyState && !verifyState.success && (
						<AuthAlert message={verifyState.error} code={verifyState.code} />
					)}
					{resendState?.success && (
						<AuthAlert message={resendState.data.message} severity="success" />
					)}
					{resendState && !resendState.success && (
						<AuthAlert message={resendState.error} code={resendState.code} />
					)}

					<div className="flex flex-col items-center gap-3">
						<CodeInput
							value={code}
							onChange={setCode}
							onComplete={handleComplete}
							disabled={isVerifying}
							error={!!(verifyState && !verifyState.success)}
							autoFocus
							shakeSignal={shakeSignal}
							length={OTP_LENGTH}
						/>

						<button
							type="button"
							onClick={handlePasteFromClipboard}
							disabled={isVerifying}
							className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]
                         hover:text-[var(--primary)] transition-colors duration-150
                         disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
							Вставить из буфера
						</button>

						{clipboardError && (
							<p
								role="alert"
								className="text-xs text-[var(--error)] text-center animate-[fade-in-up_150ms_ease-out]"
							>
								{clipboardError}
							</p>
						)}

						<Typography variant="caption" color="muted">
							Код действителен 10 минут
						</Typography>
					</div>

					<Button
						type="submit"
						variant="primary"
						size="md"
						fullWidth
						loading={isVerifying}
						disabled={isVerifying || compactCode.length !== OTP_LENGTH}
					>
						Подтвердить
					</Button>
				</form>

				<div className="mt-5 text-center">
					<form action={resendAction}>
						<input type="hidden" name="type" value={type} />
						<button
							type="submit"
							disabled={isResending || isVerifying || cooldown > 0}
							className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]
                         disabled:text-[var(--text-muted)] disabled:cursor-not-allowed
                         transition-colors duration-150"
						>
							{isResending
								? "Отправка..."
								: cooldown > 0
									? `Отправить код повторно (${cooldown}с)`
									: "Отправить код повторно"}
						</button>
					</form>
				</div>
			</Card>
		</div>
	);
}

// Маскируем email для отображения: na***@example.com
function maskEmail(email: string): string {
	const [local, domain] = email.split("@");
	if (!local || !domain) return email;
	const visible = local.slice(0, 2);
	return `${visible}***@${domain}`;
}
