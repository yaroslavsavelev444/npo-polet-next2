"use client";

import { AlertCircle, MonitorSmartphone, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { plural, pluralSessions } from "../lib/format";
import type { ProfileSession } from "../types/profile.types";
import styles from "./Profile.module.css";
import { SessionRow } from "./SessionRow";

interface SessionsTabProps {
	sessions: ProfileSession[];
	onRevoke: (sessionId: string) => Promise<void>;
	onRefresh: () => Promise<void>;
}

/**
 * Раздел «Устройства»: где сейчас открыт аккаунт.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЧЕМ ЭТОТ РАЗДЕЛ ВООБЩЕ НУЖЕН
 * ────────────────────────────────────────────────────────────────────────────
 * Ответ ровно один: заметить чужой вход и оборвать его. Поэтому композиция
 * подчинена сравнению строк между собой — одинаковые слоты, одинаковые
 * величины на одних и тех же местах, — а своё устройство стоит первым и
 * помечено: всё, что НЕ помечено, и есть предмет разговора.
 *
 * Время последней активности показано относительной шкалой («5 минут назад»):
 * вопрос у этого списка — «это я только что заходил или кто-то другой
 * позавчера», и в абсолютных датах на него приходится отвечать вычитанием в
 * уме. Точное значение остаётся в подсказке и в атрибуте datetime.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * СОСТОЯНИЯ
 * ────────────────────────────────────────────────────────────────────────────
 *  — обновление при пустом списке: скелетоны той же геометрии, что строки;
 *  — обновление при непустом: список остаётся на месте, крутится только
 *    значок в кнопке — подменять готовые данные заглушкой значит терять то,
 *    что человек уже читает;
 *  — пусто: объяснение, а не «нет данных»;
 *  — отзыв сессии: строка гаснет и кнопка показывает работу, чтобы было
 *    видно, КАКАЯ из них завершается;
 *  — отказ: сообщение остаётся в разделе, а не всплывает и исчезает.
 */
export function SessionsTab({
	sessions,
	onRevoke,
	onRefresh,
}: SessionsTabProps) {
	const [revokingId, setRevokingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isRefreshing, startRefresh] = useTransition();

	async function handleRevoke(id: string) {
		setRevokingId(id);
		setError(null);
		try {
			await onRevoke(id);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Не удалось завершить сессию. Попробуйте ещё раз.",
			);
		} finally {
			setRevokingId(null);
		}
	}

	function handleRefresh() {
		setError(null);
		startRefresh(async () => {
			try {
				await onRefresh();
			} catch (cause) {
				setError(
					cause instanceof Error
						? cause.message
						: "Не удалось обновить список устройств",
				);
			}
		});
	}

	const current = sessions.find((session) => session.isCurrent);
	const others = sessions.filter((session) => !session.isCurrent);
	// Своё устройство идёт первым: с ним сравнивают остальные.
	const ordered = current ? [current, ...others] : others;

	return (
		<div className="flex flex-col">
			<section className={styles.section}>
				<div className={styles.sectionAside}>
					<h2 className={styles.sectionTitle}>Активные устройства</h2>
					<p className={styles.sectionHint}>
						Здесь видно, где открыт ваш аккаунт. Незнакомое устройство — повод
						завершить его сессию и сменить пароль.
					</p>
				</div>

				<div className={styles.sectionBody}>
					<div className={styles.listHead}>
						<p className={catalog.micro} role="status">
							{sessions.length > 0
								? `${sessions.length} ${pluralSessions(sessions.length)}`
								: "Нет активных сессий"}
							{others.length > 0 &&
								` · ${others.length} ${plural(others.length, "другое", "других", "других")}`}
						</p>

						<button
							type="button"
							onClick={handleRefresh}
							disabled={isRefreshing}
							className={`${styles.btn} ${styles.btnQuiet} ${styles.btnSmall}`}
						>
							<RefreshCw
								size={14}
								aria-hidden
								className={isRefreshing ? styles.spin : undefined}
							/>
							{isRefreshing ? "Обновляем" : "Обновить"}
						</button>
					</div>

					{error && (
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
					)}

					{isRefreshing && sessions.length === 0 ? (
						<div aria-hidden="true">
							{Array.from({ length: 3 }, (_, index) => (
								<div key={index} className={styles.skeletonRow}>
									<div className={`${styles.skeletonPlate} animate-pulse`} />
									<div className="flex flex-1 flex-col gap-2">
										<div
											className={`${styles.skeletonLine} w-2/5 animate-pulse`}
										/>
										<div
											className={`${styles.skeletonLine} w-3/5 animate-pulse`}
										/>
									</div>
								</div>
							))}
						</div>
					) : sessions.length === 0 ? (
						<div className={styles.empty}>
							<MonitorSmartphone
								size={26}
								strokeWidth={1.25}
								aria-hidden
								className="text-[var(--border-light)]"
							/>
							<p className={styles.emptyTitle}>Активных сессий нет</p>
							<p className={styles.emptyText}>
								Устройство появится здесь, как только вы войдёте с него в
								аккаунт.
							</p>
						</div>
					) : (
						<ul className={styles.rows}>
							{ordered.map((session, index) => (
								<SessionRow
									key={session.id}
									session={session}
									index={index}
									onRevoke={session.isCurrent ? undefined : handleRevoke}
									revoking={revokingId === session.id}
								/>
							))}
						</ul>
					)}
				</div>
			</section>
		</div>
	);
}

export default SessionsTab;
