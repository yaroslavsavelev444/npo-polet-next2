"use client";

import {
	AlertCircle,
	ArrowUpRight,
	CheckCircle2,
	ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { validatePassword } from "@/utils/validatePassword";
import type { ChangePasswordPayload } from "../types/profile.types";
import { PasswordField } from "./fields";
import styles from "./Profile.module.css";

interface FormState {
	oldPassword: string;
	newPassword: string;
	confirmPassword: string;
}

interface FormErrors {
	oldPassword?: string;
	newPassword?: string;
	confirmPassword?: string;
}

/**
 * Условия пароля — ровно те, что проверяет validatePassword.
 *
 * Список обязан повторять проверку знак в знак: разойдись они, пользователь
 * увидел бы все отметки выполненными и всё равно получил отказ. Поэтому
 * рядом с каждым условием стоит его собственный предикат, а не пересказ
 * правила словами.
 */
const RULES: { id: string; label: string; test: (value: string) => boolean }[] =
	[
		{
			id: "len",
			label: "8–16 символов",
			test: (v) => v.length >= 8 && v.length <= 16,
		},
		{ id: "upper", label: "Заглавная", test: (v) => /[A-Z]/.test(v) },
		{ id: "lower", label: "Строчная", test: (v) => /[a-z]/.test(v) },
		{ id: "digit", label: "Цифра", test: (v) => /\d/.test(v) },
		{
			id: "special",
			label: "Спецсимвол",
			test: (v) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(v),
		},
	];

interface SecurityTabProps {
	onChangePassword: (payload: ChangePasswordPayload) => Promise<void>;
}

/**
 * Раздел «Безопасность»: смена пароля и необратимые действия с аккаунтом.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ИЗМЕНИЛОСЬ ПО СУЩЕСТВУ
 * ────────────────────────────────────────────────────────────────────────────
 *  1. Отказ сервера больше не пропадает. Раньше `await onChangePassword` стоял
 *     внутри перехода без перехвата: на неверном текущем пароле действие
 *     бросало исключение, форма просто переставала «думать», и человек не
 *     узнавал причину. Теперь ошибка попадает в поле, к которому относится.
 *  2. Успех объясняет последствие. Смена пароля отзывает сессии на ОСТАЛЬНЫХ
 *     устройствах (см. changePasswordAction) — об этом нужно сказать, иначе
 *     выход на телефоне выглядит сбоем.
 *  3. Требования к паролю — список, который отмечается по мере ввода, а не
 *     строка мелким шрифтом под полем. Видно, какое именно условие ещё не
 *     выполнено, и видно ДО отправки.
 *
 * Удаление аккаунта переехало сюда из «Аккаунта». Там оно соседствовало с
 * полем имени — правкой, которую делают мимоходом; здесь стоит рядом со
 * сменой пароля, то есть среди действий, ради которых в раздел заходят
 * осознанно.
 */
export function SecurityTab({ onChangePassword }: SecurityTabProps) {
	const [form, setForm] = useState<FormState>({
		oldPassword: "",
		newPassword: "",
		confirmPassword: "",
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [done, setDone] = useState(false);
	const [isPending, startTransition] = useTransition();

	function setField(field: keyof FormState) {
		return (event: React.ChangeEvent<HTMLInputElement>) => {
			const value = event.target.value;
			setForm((prev) => ({ ...prev, [field]: value }));
			if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
			if (done) setDone(false);
		};
	}

	function handleBlur(field: keyof FormState) {
		return () => {
			// Пустое поле на уходе не ругается: человек ещё не закончил
			// заполнять форму, а не ошибся.
			if (!form[field]) return;

			if (field === "newPassword") {
				const message = validatePassword(form.newPassword);
				if (message) setErrors((prev) => ({ ...prev, newPassword: message }));
			}

			if (
				field === "confirmPassword" &&
				form.newPassword &&
				form.newPassword !== form.confirmPassword
			) {
				setErrors((prev) => ({
					...prev,
					confirmPassword: "Пароли не совпадают",
				}));
			}
		};
	}

	function validate(): boolean {
		const next: FormErrors = {};

		if (!form.oldPassword) next.oldPassword = "Введите текущий пароль";
		if (!form.newPassword) next.newPassword = "Введите новый пароль";
		if (!form.confirmPassword)
			next.confirmPassword = "Подтвердите новый пароль";

		if (form.newPassword) {
			const message = validatePassword(form.newPassword);
			if (message) next.newPassword = message;
		}

		if (
			form.newPassword &&
			form.confirmPassword &&
			form.newPassword !== form.confirmPassword
		) {
			next.confirmPassword = "Пароли не совпадают";
		}

		if (
			form.oldPassword &&
			form.newPassword &&
			form.oldPassword === form.newPassword
		) {
			next.newPassword = "Новый пароль должен отличаться от текущего";
		}

		setErrors(next);
		return Object.keys(next).length === 0;
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!validate()) return;

		startTransition(async () => {
			try {
				await onChangePassword({
					oldPassword: form.oldPassword,
					newPassword: form.newPassword,
				});
				setForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
				setErrors({});
				setDone(true);
			} catch (cause) {
				const message =
					cause instanceof Error ? cause.message : "Не удалось сменить пароль";
				// Отказ по текущему паролю относится к конкретному полю, и
				// показать его нужно там же: сообщение внизу формы заставляет
				// искать, что именно не так.
				setErrors(
					message.toLowerCase().includes("текущий")
						? { oldPassword: message }
						: { newPassword: message },
				);
			}
		});
	}

	const canSubmit =
		!!form.oldPassword && !!form.newPassword && !!form.confirmPassword;

	return (
		<div className="flex flex-col">
			<section className={styles.section}>
				<div className={styles.sectionAside}>
					<h2 className={styles.sectionTitle}>Смена пароля</h2>
					<p className={styles.sectionHint}>
						После смены вход сохранится только на этом устройстве — на остальных
						придётся войти заново. Так украденная сессия теряет доступ сразу.
					</p>
				</div>

				<div className={styles.sectionBody}>
					{/* Настоящая форма, а не набор полей с кнопкой: Enter в любом поле
					    отправляет, менеджеры паролей распознают смену пароля и
					    предлагают сохранить новый. */}
					<form onSubmit={handleSubmit} noValidate aria-busy={isPending}>
						<div className="flex flex-col gap-[1.25rem]">
							<PasswordField
								label="Текущий пароль"
								placeholder="Введите текущий пароль"
								value={form.oldPassword}
								onChange={setField("oldPassword")}
								onBlur={handleBlur("oldPassword")}
								error={errors.oldPassword}
								disabled={isPending}
								autoComplete="current-password"
							/>

							<div className="flex flex-col gap-[0.75rem]">
								<PasswordField
									label="Новый пароль"
									placeholder="Придумайте новый пароль"
									value={form.newPassword}
									onChange={setField("newPassword")}
									onBlur={handleBlur("newPassword")}
									error={errors.newPassword}
									disabled={isPending}
									autoComplete="new-password"
								/>

								<ul className={styles.rules} aria-label="Требования к паролю">
									{RULES.map((rule) => {
										const met = rule.test(form.newPassword);
										return (
											<li
												key={rule.id}
												className={styles.rule}
												data-met={met || undefined}
											>
												<span className={styles.ruleMark} aria-hidden>
													<svg
														viewBox="0 0 24 24"
														className="size-[0.5rem]"
														fill="none"
														stroke="currentColor"
														strokeWidth="4"
														strokeLinecap="round"
														strokeLinejoin="round"
													>
														<path
															className={styles.ruleCheck}
															d="M4 12.5 9.5 18 20 6.5"
														/>
													</svg>
												</span>
												{/* Состояние проговаривается словом, а не только
												    цветом и галочкой: иначе список бесполезен для
												    скринридера и для того, кто не различает
												    зелёный. */}
												<span>
													{rule.label}
													<span className="sr-only">
														{met ? " — выполнено" : " — не выполнено"}
													</span>
												</span>
											</li>
										);
									})}
								</ul>
							</div>

							<PasswordField
								label="Подтверждение"
								placeholder="Повторите новый пароль"
								value={form.confirmPassword}
								onChange={setField("confirmPassword")}
								onBlur={handleBlur("confirmPassword")}
								error={errors.confirmPassword}
								disabled={isPending}
								autoComplete="new-password"
							/>

							{done && (
								<p
									role="status"
									className={`${styles.notice} ${styles.noticeOk}`}
								>
									<CheckCircle2
										size={15}
										aria-hidden
										className={`${styles.noticeIcon} ${styles.noticeOkIcon}`}
									/>
									Пароль изменён. Сессии на других устройствах завершены — там
									понадобится войти заново.
								</p>
							)}

							<div className={styles.actions}>
								<button
									type="submit"
									disabled={!canSubmit || isPending}
									className={`${styles.btn} ${styles.btnPrimary}`}
								>
									{isPending ? "Меняем…" : "Сменить пароль"}
								</button>
							</div>
						</div>
					</form>
				</div>
			</section>

			<section className={`${styles.section} ${styles.sectionDanger}`}>
				<div className={styles.sectionAside}>
					<h2 className={styles.sectionTitle}>Необратимые действия</h2>
					<p className={styles.sectionHint}>
						Удаление аккаунта исполняется через 14 дней после заявки. Пока срок
						не вышел, заявку можно отозвать.
					</p>
				</div>

				<div className={styles.sectionBody}>
					<ul className={styles.rows}>
						<li>
							<Link href="/profile/delete-account" className={styles.rowLink}>
								<span className={styles.row}>
									<span
										className={styles.rowIcon}
										aria-hidden
										style={{ color: "var(--error)" }}
									>
										<ShieldAlert size={18} />
									</span>
									<span className={styles.rowMain}>
										<span className={styles.rowTitle}>
											<span className={styles.rowTitleText}>
												Удалить аккаунт
											</span>
										</span>
										<span className={styles.rowMeta}>
											Профиль, сессии, корзина и избранное будут удалены, данные
											в заказах — обезличены
										</span>
									</span>
									<ArrowUpRight
										size={16}
										aria-hidden
										className={styles.rowArrow}
									/>
								</span>
							</Link>
						</li>
					</ul>

					<p className={`${styles.notice} ${styles.noticeWarn}`}>
						<AlertCircle
							size={15}
							aria-hidden
							className={`${styles.noticeIcon} ${styles.noticeWarnIcon}`}
						/>
						Если доступ к аккаунту вызывает сомнения, сначала смените пароль —
						это отключит все остальные устройства.
					</p>
				</div>
			</section>
		</div>
	);
}

export default SecurityTab;
