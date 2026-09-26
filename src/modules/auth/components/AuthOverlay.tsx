"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/UI/Modal/Modal";
import { getRegisterConsentsAction } from "../actions/consents";
import {
	type AuthOverlayStep,
	useAuthOverlay,
} from "../store/auth-overlay.store";
import type { ConsentListItem, OtpType } from "../types";
import { LoginForm } from "./LoginForm";
import { OtpForm } from "./OtpForm";
import { RegisterForm } from "./RegisterForm";

/**
 * Вход и регистрация поверх текущей страницы.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЧЕМ ЭТО ОКНО СУЩЕСТВУЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * До него путь к покупке выглядел так: корзина → «Войти и оформить» → УХОД со
 * страницы на /auth/login → форма → письмо с кодом → ввод кода → возврат.
 * Четыре смены контекста подряд в тот момент, когда человек уже решил купить.
 * Здесь всё это происходит поверх корзины: список товаров остаётся на экране,
 * страница не перезагружается, после входа человек продолжает с того же
 * места.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ЗДЕСЬ НЕ ПЕРЕПИСАНО
 * ────────────────────────────────────────────────────────────────────────────
 * Ничего из самой авторизации. Формы — те же LoginForm, RegisterForm и
 * OtpForm, что и на отдельных страницах, с теми же действиями, той же
 * валидацией, теми же согласиями и тем же подтверждением почты. Отличий ровно
 * три, и все три — про оформление: компактная шапка, переключение шагов
 * вместо ссылок и `flow="overlay"`, по которому verifyOtpAction не делает
 * серверный redirect (см. verifyOtp.ts).
 *
 * Собственной копии форм здесь нет и быть не должно: две редакции формы входа
 * разошлись бы на первом же изменении правил пароля или состава согласий.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ПРОИСХОДИТ ПОСЛЕ УСПЕХА
 * ────────────────────────────────────────────────────────────────────────────
 * Окно НЕ решает, куда вести человека, — это знает только тот, кто его
 * открыл, и он передал продолжение (см. store/auth-overlay.store.ts).
 * Продолжение выполняется ДО закрытия окна и до обновления страницы: для
 * корзины это перенос гостевых позиций в аккаунт, и он обязан завершиться
 * раньше, чем откроется форма оформления, — иначе она отрендерится по ещё
 * пустой серверной корзине и развернёт обратно в /cart.
 */

/** Шаг ввода кода добавляется к шагам стора: попасть на него можно только изнутри. */
type OverlayStep = AuthOverlayStep | "otp";

export function AuthOverlay() {
	const router = useRouter();
	const isOpen = useAuthOverlay((s) => s.isOpen);
	const initialStep = useAuthOverlay((s) => s.initialStep);
	const reason = useAuthOverlay((s) => s.reason);
	const close = useAuthOverlay((s) => s.close);

	const [step, setStep] = useState<OverlayStep>(initialStep);
	const [email, setEmail] = useState("");
	const [otpType, setOtpType] = useState<OtpType>("login_2fa");
	const [consents, setConsents] = useState<ConsentListItem[] | null>(null);
	const [consentsError, setConsentsError] = useState(false);
	const [isFinishing, setIsFinishing] = useState(false);

	// Каждое открытие начинается с чистого листа: шаг — тот, о котором
	// попросил вызывающий, введённая почта — забыта. Без сброса окно,
	// закрытое на вводе кода, открылось бы в следующий раз там же, с
	// челленджем, которого уже нет.
	useEffect(() => {
		if (!isOpen) return;
		setStep(initialStep);
		setEmail("");
		setOtpType("login_2fa");
		setIsFinishing(false);
	}, [isOpen, initialStep]);

	// Согласия нужны только форме регистрации, поэтому и запрашиваются только
	// при переходе на неё — и один раз за жизнь компонента: их состав не
	// меняется в пределах сеанса.
	useEffect(() => {
		if (step !== "register" || consents !== null) return;

		let cancelled = false;
		setConsentsError(false);

		void getRegisterConsentsAction()
			.then((list) => {
				if (!cancelled) setConsents(list);
			})
			.catch(() => {
				if (!cancelled) setConsentsError(true);
			});

		return () => {
			cancelled = true;
		};
	}, [step, consents]);

	const handleRequiresOtp = useCallback(
		(type: OtpType) => (enteredEmail: string) => {
			setEmail(enteredEmail);
			setOtpType(type);
			setStep("otp");
		},
		[],
	);

	/**
	 * Вход состоялся — обеими дорогами: с кодом и без него (доверенное
	 * устройство, см. lib/trustedDevice.ts). Дальше одно и то же.
	 */
	const handleAuthenticated = useCallback(
		async (userId: string) => {
			// Продолжение снимается вместе с закрытием окна, поэтому забираем
			// его ДО close().
			const { continuation } = useAuthOverlay.getState();

			setIsFinishing(true);

			try {
				await continuation?.(userId);
			} catch (err) {
				// Сбой продолжения (не доехал перенос корзины) не отменяет вход:
				// человек авторизован, окно обязано закрыться, а состав корзины
				// подтянется обычным обновлением страницы ниже.
				console.error("[auth-overlay] continuation failed:", err);
			}

			close();

			// Вход меняет то, что рендерит корневой layout: шапку с именем,
			// счётчик корзины, избранное. Серверные действия уже сбросили кэш
			// (revalidatePath), но забрать свежее дерево должен клиент — иначе
			// на экране останется навбар, отрисованный для гостя.
			router.refresh();
		},
		[close, router],
	);

	const handleClose = useCallback(() => {
		// Пока идёт перенос корзины и переход, закрывать нечего: окно и так
		// исчезнет через мгновение, а закрытие посреди этого оставило бы
		// человека без объяснения, что происходит.
		if (isFinishing) return;
		close();
	}, [close, isFinishing]);

	if (!isOpen) return null;

	return (
		<Modal
			open={isOpen}
			onClose={handleClose}
			closeOnOverlay={!isFinishing}
			closeOnEscape={!isFinishing}
			width={460}
		>
			{reason && step !== "otp" && (
				<p className="mb-5 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5 text-[13px] leading-snug text-[var(--text-secondary)]">
					<ShieldCheck
						size={15}
						aria-hidden
						className="mt-px shrink-0 text-[var(--accent)]"
					/>
					{reason}
				</p>
			)}

			{isFinishing ? (
				<div
					className="flex flex-col items-center gap-3 py-10 text-center"
					role="status"
				>
					<Loader2
						size={22}
						aria-hidden
						className="animate-spin text-[var(--accent)]"
					/>
					{/* Формулировка намеренно не называет ни корзину, ни
					    оформление: окно открывают и ради избранного, и ради
					    отзыва, а «готовим заказ» в этих случаях было бы
					    неправдой. */}
					<p className="text-sm text-[var(--text-secondary)]">
						Вы вошли — возвращаемся на место
					</p>
				</div>
			) : step === "otp" ? (
				<OtpForm
					type={otpType}
					email={email}
					title={
						otpType === "email_verify"
							? "Подтверждение email"
							: "Подтверждение входа"
					}
					description="Введите код, отправленный на"
					flow="overlay"
					bare
					onAuthenticated={handleAuthenticated}
					onBack={() =>
						setStep(otpType === "email_verify" ? "register" : "login")
					}
				/>
			) : step === "register" ? (
				<RegisterStep
					consents={consents}
					hasError={consentsError}
					onRetry={() => {
						setConsents(null);
						setConsentsError(false);
					}}
					onRequiresOtp={handleRequiresOtp("email_verify")}
					onSwitchToLogin={() => setStep("login")}
				/>
			) : (
				<LoginForm
					compact
					onRequiresOtp={handleRequiresOtp("login_2fa")}
					onAuthenticated={handleAuthenticated}
					onSwitchToRegister={() => setStep("register")}
					// Восстановление пароля — единственная ветка, которая всё-таки
					// уводит со страницы: это отдельный флоу с письмом и ссылкой, и
					// втискивать его в окно поверх корзины значило бы удерживать
					// человека там, куда он уже не вернётся этим же заходом.
					// Корзина при этом не теряется: у гостя она в localStorage, у
					// вошедшего — на сервере.
					onForgotPassword={close}
				/>
			)}
		</Modal>
	);
}

/**
 * Шаг регистрации со своей загрузкой согласий.
 *
 * Отдельным компонентом, чтобы три состояния (грузим / не смогли / готово)
 * не расползлись по тернарникам основного дерева. Форма не показывается, пока
 * согласия не приехали: без них кнопка отправки всё равно заблокирована
 * (registerAction требует принятия обязательных), и пустой список выглядел бы
 * как «согласий нет», а не «ещё не загрузились».
 */
function RegisterStep({
	consents,
	hasError,
	onRetry,
	onRequiresOtp,
	onSwitchToLogin,
}: {
	consents: ConsentListItem[] | null;
	hasError: boolean;
	onRetry: () => void;
	onRequiresOtp: (email: string) => void;
	onSwitchToLogin: () => void;
}) {
	if (hasError) {
		return (
			<div className="flex flex-col items-center gap-3 py-10 text-center">
				<p className="text-sm text-[var(--text-secondary)]">
					Не удалось загрузить условия регистрации.
				</p>
				<button
					type="button"
					onClick={onRetry}
					className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
				>
					Попробовать ещё раз
				</button>
			</div>
		);
	}

	if (consents === null) {
		return (
			<div
				className="flex items-center justify-center py-12"
				role="status"
				aria-label="Загрузка формы регистрации"
			>
				<Loader2
					size={22}
					aria-hidden
					className="animate-spin text-[var(--text-muted)]"
				/>
			</div>
		);
	}

	return (
		<RegisterForm
			compact
			consents={consents}
			onRequiresOtp={onRequiresOtp}
			onSwitchToLogin={onSwitchToLogin}
		/>
	);
}
