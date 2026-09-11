"use client";

import {
	AlertCircle,
	ArrowLeft,
	Ban,
	CheckCircle2,
	Clock3,
	Database,
	Loader2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import {
	type BreadcrumbItem,
	Breadcrumbs,
} from "@/components/Breadcrumbs/Breadcrumbs";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { PasswordField } from "@/modules/profile/components/fields";
import styles from "@/modules/profile/components/Profile.module.css";
import { formatDateTime, plural } from "@/modules/profile/lib/format";
import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { PageContainer } from "@/shared/components/PageContainer";
import type { AccountDeletionView } from "../lib/service";

type Props = {
	request: AccountDeletionView | null;
	createRequest: (input: {
		password: string;
		acknowledged: boolean;
	}) => Promise<AccountDeletionView>;
	cancelRequest: (requestId: string) => Promise<AccountDeletionView>;
};

const BREADCRUMBS: BreadcrumbItem[] = [
	{ title: "Главная", href: "/" },
	{ title: "Личный кабинет", href: "/profile" },
	{ title: "Удаление аккаунта" },
];

const RISKS = [
	{
		icon: Clock3,
		text: "Через 14 дней будут удалены аккаунт, сессии, корзина, избранное, отзывы и обращения.",
	},
	{
		icon: Database,
		text: "Данные в заказах, которые закон требует хранить для бухгалтерского учёта, будут обезличены.",
	},
	{
		icon: Ban,
		text: "После начала исполнения восстановить аккаунт и данные невозможно.",
	},
];

function timeLeft(scheduledFor: string, now: number) {
	const delta = Math.max(0, new Date(scheduledFor).getTime() - now);
	return {
		days: Math.floor(delta / 86_400_000),
		hours: Math.floor((delta % 86_400_000) / 3_600_000),
	};
}

/**
 * Удаление аккаунта — раздел кабинета, вынесенный на отдельный адрес.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ОТДЕЛЬНАЯ СТРАНИЦА, А НЕ ВКЛАДКА
 * ────────────────────────────────────────────────────────────────────────────
 * Сюда приходят осознанно и по ссылке из «Безопасности», а уходят чаще всего
 * не совершив действия. Отдельный адрес даёт две вещи, которых у вкладки нет:
 * на него можно сослаться в переписке с поддержкой, и с него есть куда
 * вернуться — в кабинет, ничего не тронув.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * МАТЕРИАЛ И РАСКЛАДКА
 * ────────────────────────────────────────────────────────────────────────────
 * Те же, что во всём кабинете: полоса первого экрана --void-deep, секции в
 * две колонки (слева объяснение, справа орган управления), поля с
 * подчёркиванием. Общий CSS-модуль profile/components/Profile.module.css — не
 * копия его классов: страница принадлежит кабинету и обязана меняться вместе
 * с ним.
 *
 * Красным здесь помечено только то, что нажимают, и значки перечня
 * последствий. Прежняя версия заливала красным целые панели — на тёмной
 * витрине это кричит раньше, чем текст успевают прочитать, а прочитать здесь
 * обязательно.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * СОСТОЯНИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Заявки нет / отменена / сорвалась — форма создания. Ждёт исполнения —
 * обратный отсчёт со шкалой и отмена. Исполняется — объяснение, почему
 * отменить уже нельзя. Исполнена — подтверждение. Каждое состояние отвечает
 * на вопрос «что сейчас и что я могу сделать», а не просто называет статус.
 */
export function AccountDeletionPageClient({
	request: initialRequest,
	createRequest,
	cancelRequest,
}: Props) {
	const [request, setRequest] = useState(initialRequest);
	const [password, setPassword] = useState("");
	const [acknowledged, setAcknowledged] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const [clock, setClock] = useState(() => Date.now());
	const ackId = useId();

	useEffect(() => {
		if (request?.status !== "pending") return;
		const timer = window.setInterval(() => setClock(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, [request?.status]);

	const isCancellable =
		request?.status === "pending" &&
		new Date(request.scheduledFor).getTime() > Date.now();

	const remaining = useMemo(
		() => (request ? timeLeft(request.scheduledFor, clock) : null),
		[request, clock],
	);

	const progressPct = useMemo(() => {
		if (!request) return 0;
		const start = new Date(request.requestedAt).getTime();
		const end = new Date(request.scheduledFor).getTime();
		if (end <= start) return 100;
		return Math.min(100, Math.max(0, ((clock - start) / (end - start)) * 100));
	}, [request, clock]);

	const blocked = request?.status === "failed";

	function submit() {
		setError(null);
		startTransition(async () => {
			try {
				const next = await createRequest({ password, acknowledged });
				setRequest(next);
				setPassword("");
				setAcknowledged(false);
			} catch (cause) {
				setError(
					cause instanceof Error
						? cause.message
						: "Не удалось отправить заявку",
				);
			}
		});
	}

	function cancel() {
		if (!request) return;
		setError(null);
		startTransition(async () => {
			try {
				setRequest(await cancelRequest(request.id));
			} catch (cause) {
				setError(
					cause instanceof Error ? cause.message : "Не удалось отменить заявку",
				);
			}
		});
	}

	return (
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<section
				className="relative isolate overflow-hidden bg-[var(--void-deep)]"
				style={{
					marginTop: "calc(-1 * var(--sticky-header-height))",
					paddingTop: "var(--sticky-header-height)",
				}}
			>
				{/* Источник света тот же, что на остальных первых экранах, но
				    приглушённый: страница не должна выглядеть нарядной. */}
				<div
					className="pointer-events-none absolute inset-0 -z-10"
					aria-hidden="true"
					style={{
						background:
							"radial-gradient(110% 70% at 8% 100%, color-mix(in srgb, var(--error) 10%, transparent) 0%, transparent 58%)",
					}}
				/>
				<div
					className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--rule)]"
					aria-hidden="true"
				/>

				<PageContainer className="flex flex-col pb-[clamp(2.5rem,5vw,4rem)] pt-[clamp(1.5rem,3vw,2.5rem)]">
					<Breadcrumbs items={BREADCRUMBS} />

					<div className="mt-[clamp(1.5rem,3vw,2.5rem)] flex flex-col gap-[clamp(1.25rem,3vw,3rem)] xl:flex-row xl:items-end xl:gap-[3rem]">
						{/* «УДАЛЕНИЕ» — 8 знаков, ~9.2em: при верхней границе 4.25rem
						    это 625px в колонке 800px. Запас есть; меняя текст, его
						    нужно пересчитать. */}
						<h1 className="u-display min-w-0 flex-1 text-[clamp(1.5rem,0.5rem+4vw,4.25rem)] leading-[0.96] text-[var(--text-primary)]">
							<RevealLines lines={["Удаление", "аккаунта"]} stagger={120} />
						</h1>

						<Reveal delay={240} className="xl:w-[24rem] xl:shrink-0">
							<p className="max-w-[52ch] text-[0.9375rem] leading-[1.6] text-[var(--text-secondary)]">
								Право на удаление персональных данных. Заявка исполняется через
								14 дней — этот срок даётся, чтобы передумать и чтобы заметить
								чужой запрос, если доступ к аккаунту потерян.
							</p>
						</Reveal>
					</div>
				</PageContainer>
			</section>

			<PageContainer className="pb-[4rem]">
				<div className="flex flex-col">
					{/* Возврат в кабинет стоит первым и остаётся на виду: уйти
					    отсюда, ничего не сделав, — самый частый и самый желательный
					    исход. */}
					<div className="pt-[clamp(1.5rem,3vw,2.25rem)]">
						<Link
							href="/profile?tab=security"
							className={`${styles.btn} ${styles.btnQuiet} ${styles.btnSmall}`}
						>
							<ArrowLeft size={14} aria-hidden />
							Вернуться в кабинет
						</Link>
					</div>

					{error && (
						<div className="pt-[1.25rem]">
							<p
								role="alert"
								className={`${styles.notice} ${styles.noticeError}`}
							>
								<AlertCircle
									size={15}
									aria-hidden
									className={`${styles.noticeIcon} ${styles.noticeErrorIcon}`}
								/>
								{error}
							</p>
						</div>
					)}

					{request?.status === "pending" ? (
						<section className={styles.section}>
							<div className={styles.sectionAside}>
								<h2 className={styles.sectionTitle}>Заявка принята</h2>
								<p className={styles.sectionHint}>
									Пока идёт период ожидания, аккаунт работает как обычно и
									заявку можно отозвать.
								</p>
							</div>

							<div className={styles.sectionBody}>
								<div className={styles.countdown}>
									<p className={catalog.micro}>До удаления</p>

									{remaining && (
										<p className={styles.countdownValue}>
											{remaining.days}
											<span className={styles.countdownUnit}>
												{plural(remaining.days, "день", "дня", "дней")}
											</span>
											{remaining.hours}
											<span className={styles.countdownUnit}>
												{plural(remaining.hours, "час", "часа", "часов")}
											</span>
										</p>
									)}

									<div
										className={styles.progress}
										role="progressbar"
										aria-valuemin={0}
										aria-valuemax={100}
										aria-valuenow={Math.round(progressPct)}
										aria-label="Прошло от периода ожидания"
									>
										<div
											className={styles.progressBar}
											style={{ width: `${progressPct}%` }}
										/>
									</div>

									<p className="m-0 text-[0.8125rem] leading-relaxed text-[var(--text-secondary)]">
										Исполнение начнётся после{" "}
										{formatDateTime(request.scheduledFor)}.
									</p>
								</div>

								{isCancellable && (
									<div className={styles.actions}>
										<button
											type="button"
											onClick={cancel}
											disabled={isPending}
											className={`${styles.btn} ${styles.btnQuiet}`}
										>
											{isPending && (
												<Loader2
													size={15}
													aria-hidden
													className={styles.spin}
												/>
											)}
											{isPending ? "Отменяем…" : "Отозвать заявку"}
										</button>
									</div>
								)}
							</div>
						</section>
					) : request?.status === "executing" ? (
						<section className={styles.section}>
							<div className={styles.sectionAside}>
								<h2 className={styles.sectionTitle}>Заявка исполняется</h2>
								<p className={styles.sectionHint}>
									Период ожидания истёк, удаление уже началось.
								</p>
							</div>
							<div className={styles.sectionBody}>
								<p className={`${styles.notice} ${styles.noticeWarn}`}>
									<Clock3
										size={15}
										aria-hidden
										className={`${styles.noticeIcon} ${styles.noticeWarnIcon}`}
									/>
									Отменить заявку больше нельзя. Часть данных уже удалена или
									обезличена.
								</p>
							</div>
						</section>
					) : request?.status === "completed" ? (
						<section className={styles.section}>
							<div className={styles.sectionAside}>
								<h2 className={styles.sectionTitle}>Заявка выполнена</h2>
								<p className={styles.sectionHint}>
									Аккаунт и связанные персональные данные удалены или
									обезличены.
								</p>
							</div>
							<div className={styles.sectionBody}>
								<p className={`${styles.notice} ${styles.noticeOk}`}>
									<CheckCircle2
										size={15}
										aria-hidden
										className={`${styles.noticeIcon} ${styles.noticeOkIcon}`}
									/>
									Исполнено{" "}
									{request.executedAt
										? formatDateTime(request.executedAt)
										: "—"}
									.
								</p>
							</div>
						</section>
					) : (
						<>
							{request?.status === "cancelled" && (
								<section className={styles.section}>
									<div className={styles.sectionAside}>
										<h2 className={styles.sectionTitle}>Заявка отозвана</h2>
										<p className={styles.sectionHint}>
											Аккаунт остаётся в силе — делать ничего не нужно.
										</p>
									</div>
									<div className={styles.sectionBody}>
										<p className={`${styles.notice} ${styles.noticeOk}`}>
											<CheckCircle2
												size={15}
												aria-hidden
												className={`${styles.noticeIcon} ${styles.noticeOkIcon}`}
											/>
											Предыдущая заявка отменена. При необходимости можно
											создать новую.
										</p>
									</div>
								</section>
							)}

							{blocked && (
								<section className={styles.section}>
									<div className={styles.sectionAside}>
										<h2 className={styles.sectionTitle}>Нужен оператор</h2>
										<p className={styles.sectionHint}>
											Предыдущая заявка не была исполнена автоматически.
										</p>
									</div>
									<div className={styles.sectionBody}>
										<p
											className={`${styles.notice} ${styles.noticeError}`}
											role="alert"
										>
											<AlertCircle
												size={15}
												aria-hidden
												className={`${styles.noticeIcon} ${styles.noticeErrorIcon}`}
											/>
											Обратитесь в поддержку — повторные запросы создавать не
											нужно, они не ускорят обработку.
										</p>
									</div>
								</section>
							)}

							<section className={styles.section}>
								<div className={styles.sectionAside}>
									<h2 className={styles.sectionTitle}>Что будет удалено</h2>
									<p className={styles.sectionHint}>
										Прочитайте до конца: после начала исполнения отменить ничего
										нельзя.
									</p>
								</div>

								<div className={styles.sectionBody}>
									<ul className={styles.riskList}>
										{RISKS.map(({ icon: Icon, text }) => (
											<li key={text} className={styles.riskItem}>
												<Icon
													size={16}
													aria-hidden
													className={styles.riskIcon}
												/>
												<span>{text}</span>
											</li>
										))}
									</ul>
								</div>
							</section>

							<section className={`${styles.section} ${styles.sectionDanger}`}>
								<div className={styles.sectionAside}>
									<h2 className={styles.sectionTitle}>Создать заявку</h2>
									<p className={styles.sectionHint}>
										Пароль подтверждает, что заявку создаёте именно вы, а не
										тот, кто получил доступ к открытой вкладке.
									</p>
								</div>

								<div className={styles.sectionBody}>
									<PasswordField
										label="Текущий пароль"
										placeholder="Введите пароль от аккаунта"
										value={password}
										onChange={(event) => setPassword(event.target.value)}
										disabled={isPending || blocked}
										autoComplete="current-password"
									/>

									<label className={styles.check} htmlFor={ackId}>
										<input
											id={ackId}
											type="checkbox"
											checked={acknowledged}
											onChange={(event) =>
												setAcknowledged(event.target.checked)
											}
											disabled={isPending || blocked}
											className={styles.checkInput}
										/>
										<span className={styles.checkBox} aria-hidden="true">
											<svg
												viewBox="0 0 24 24"
												className="size-3.5"
												fill="none"
												stroke="#fff"
												strokeWidth="3"
												strokeLinecap="round"
												strokeLinejoin="round"
											>
												<path
													className={styles.checkMark}
													d="M4 12.5 9.5 18 20 6.5"
												/>
											</svg>
										</span>
										<span className={styles.checkText}>
											Я понимаю последствия и хочу создать запрос на удаление
											аккаунта.
										</span>
									</label>

									<div className={styles.actions}>
										<button
											type="button"
											onClick={submit}
											disabled={
												!password || !acknowledged || isPending || blocked
											}
											className={`${styles.btn} ${styles.btnDanger}`}
										>
											{isPending && (
												<Loader2
													size={15}
													aria-hidden
													className={styles.spin}
												/>
											)}
											{isPending ? "Отправляем…" : "Создать заявку на удаление"}
										</button>

										<Link
											href="/profile?tab=security"
											className={`${styles.btn} ${styles.btnQuiet}`}
										>
											Передумал
										</Link>
									</div>
								</div>
							</section>
						</>
					)}
				</div>
			</PageContainer>
		</main>
	);
}
