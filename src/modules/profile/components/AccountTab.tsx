"use client";

import {
	AlertCircle,
	ArrowUpRight,
	CheckCircle2,
	Heart,
	Mail,
	MessageSquareText,
	Package,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ProfileUser, UpdateAccountPayload } from "../types/profile.types";
import { TextField } from "./fields";
import styles from "./Profile.module.css";

/**
 * Допустимые знаки имени: буквы, дефис, апостроф и пробел между словами.
 *
 * Правило НЕ ужесточено до «Фамилия Имя Отчество»: у части покупателей
 * отчества нет, и запрет сохранить «Ли Вэй» был бы ошибкой валидации, а не
 * пользователя. Прежнее сообщение обещало именно такой формат и вводило в
 * заблуждение — проверка его никогда не требовала.
 */
const NAME_RE = /^[A-Za-zА-ЯЁа-яё]+(?:[-' ][A-Za-zА-ЯЁа-яё]+)*$/u;
const NAME_MAX = 120;

interface CabinetLink {
	href: string;
	title: string;
	hint: string;
	icon: ReactNode;
}

/**
 * Переходы в остальные разделы кабинета.
 *
 * Раньше их здесь не было, и страница профиля оказывалась тупиком: заказы,
 * избранное и отзывы жили только в выпадающем меню шапки, о котором на
 * телефоне ещё нужно догадаться. Это не новая функциональность — ровно те же
 * существующие страницы, просто названные там, где их ищут.
 */
const CABINET_LINKS: CabinetLink[] = [
	{
		href: "/orders",
		title: "Мои заказы",
		hint: "История покупок, статусы и документы",
		icon: <Package size={18} aria-hidden />,
	},
	{
		href: "/wishlist",
		title: "Избранное",
		hint: "Отложенные изделия",
		icon: <Heart size={18} aria-hidden />,
	},
	{
		href: "/profile/reviews",
		title: "Мои отзывы",
		hint: "Оставленные оценки и комментарии",
		icon: <MessageSquareText size={18} aria-hidden />,
	},
];

interface AccountTabProps {
	user: ProfileUser;
	onUpdate: (payload: UpdateAccountPayload) => Promise<void>;
}

/**
 * Раздел «Аккаунт»: личные данные и переходы по кабинету.
 *
 * Кнопка «Сохранить» появляется только когда есть что сохранять, и рядом с
 * ней — «Отменить»: отказаться от правки, не помня исходного значения,
 * иначе невозможно.
 *
 * Ответ об успехе остаётся на экране, а не уезжает всплывающим уведомлением:
 * вопрос «сохранилось или нет» возникает позже, чем тост исчезает. Тот же
 * вывод, что и у формы обратной связи на контактах.
 */
export function AccountTab({ user, onUpdate }: AccountTabProps) {
	const [name, setName] = useState(() => user.name);
	const [error, setError] = useState<string | null>(null);
	const [serverError, setServerError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [isPending, startTransition] = useTransition();
	const savedTimer = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (savedTimer.current) window.clearTimeout(savedTimer.current);
		},
		[],
	);

	const isDirty = name.trim() !== user.name.trim();

	function validate(): boolean {
		const value = name.trim();
		if (!value) {
			setError("Введите имя");
			return false;
		}
		if (value.length > NAME_MAX) {
			setError(`Не длиннее ${NAME_MAX} символов`);
			return false;
		}
		if (!NAME_RE.test(value)) {
			setError("Допустимы буквы, пробел, дефис и апостроф");
			return false;
		}
		setError(null);
		return true;
	}

	function handleSave() {
		if (!validate()) return;
		setServerError(null);
		setSaved(false);

		startTransition(async () => {
			try {
				await onUpdate({ name: name.trim() });
				setSaved(true);
				// Подтверждение держится полминуты и уходит само: оно отвечает на
				// вопрос, который задают сразу после нажатия, и через минуту уже
				// только занимает место.
				if (savedTimer.current) window.clearTimeout(savedTimer.current);
				savedTimer.current = window.setTimeout(() => setSaved(false), 30_000);
			} catch (cause) {
				// Без этого перехвата отказ сервера превращался в необработанное
				// отклонение промиса внутри перехода: кнопка переставала крутиться,
				// а пользователь не узнавал, что имя не сохранено.
				setServerError(
					cause instanceof Error
						? cause.message
						: "Не удалось сохранить изменения",
				);
			}
		});
	}

	function handleReset() {
		setName(user.name);
		setError(null);
		setServerError(null);
	}

	return (
		<div className="flex flex-col">
			<section className={styles.section}>
				<div className={styles.sectionAside}>
					<h2 className={styles.sectionTitle}>Личные данные</h2>
					<p className={styles.sectionHint}>
						Имя подставляется в заказы и обращения — по нему менеджер обращается
						к вам. Почта служит логином и изменить её из кабинета нельзя.
					</p>
				</div>

				<div className={styles.sectionBody}>
					<TextField
						label="Имя"
						placeholder="Как к вам обращаться"
						value={name}
						maxLength={NAME_MAX}
						onChange={(event) => {
							setName(event.target.value);
							if (error) setError(null);
							if (saved) setSaved(false);
						}}
						onBlur={() => {
							if (name.trim()) validate();
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" && isDirty) {
								event.preventDefault();
								handleSave();
							}
						}}
						error={error ?? undefined}
						disabled={isPending}
						autoComplete="name"
						enterKeyHint="done"
					/>

					<TextField
						label="Почта"
						labelNote="нельзя изменить"
						type="email"
						value={user.email}
						readOnly
						locked
						icon={<Mail size={14} />}
						hint="Чтобы сменить адрес, напишите в поддержку — мы проверим владение новой почтой."
					/>

					{serverError && (
						<p
							role="alert"
							className={`${styles.notice} ${styles.noticeError}`}
						>
							<AlertCircle
								size={15}
								aria-hidden
								className={`${styles.noticeIcon} ${styles.noticeErrorIcon}`}
							/>
							{serverError}
						</p>
					)}

					{saved && !isDirty && (
						<p role="status" className={`${styles.notice} ${styles.noticeOk}`}>
							<CheckCircle2
								size={15}
								aria-hidden
								className={`${styles.noticeIcon} ${styles.noticeOkIcon}`}
							/>
							Изменения сохранены
						</p>
					)}

					<div className={styles.actions}>
						<button
							type="button"
							onClick={handleSave}
							disabled={!isDirty || isPending}
							className={`${styles.btn} ${styles.btnPrimary}`}
						>
							{isPending ? "Сохраняем…" : "Сохранить"}
						</button>

						{isDirty && !isPending && (
							<button
								type="button"
								onClick={handleReset}
								className={`${styles.btn} ${styles.btnQuiet}`}
							>
								Отменить
							</button>
						)}
					</div>
				</div>
			</section>

			<section className={styles.section}>
				<div className={styles.sectionAside}>
					<h2 className={styles.sectionTitle}>Разделы кабинета</h2>
					<p className={styles.sectionHint}>
						Всё, что относится к вашему аккаунту, — в одном месте.
					</p>
				</div>

				<div className={styles.sectionBody}>
					<ul className={styles.rows}>
						{CABINET_LINKS.map((link) => (
							<li key={link.href}>
								<Link href={link.href} className={styles.rowLink}>
									<span className={styles.row}>
										<span className={styles.rowIcon} aria-hidden>
											{link.icon}
										</span>
										<span className={styles.rowMain}>
											<span className={styles.rowTitle}>
												<span className={styles.rowTitleText}>
													{link.title}
												</span>
											</span>
											<span className={styles.rowMeta}>{link.hint}</span>
										</span>
										<ArrowUpRight
											size={16}
											aria-hidden
											className={styles.rowArrow}
										/>
									</span>
								</Link>
							</li>
						))}
					</ul>
				</div>
			</section>
		</div>
	);
}

export default AccountTab;
