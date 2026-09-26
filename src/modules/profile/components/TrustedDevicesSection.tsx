"use client";

import {
	AlertCircle,
	Loader2,
	MapPin,
	ShieldCheck,
	ShieldOff,
} from "lucide-react";
import { useState } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { cn } from "@/utils/cn";
import { formatDate, formatRelative, plural } from "../lib/format";
import type { ProfileTrustedDevice } from "../types/profile.types";
import styles from "./Profile.module.css";

interface TrustedDevicesSectionProps {
	devices: ProfileTrustedDevice[];
	onRevoke: (deviceId: string) => Promise<void>;
	onRevokeAll: () => Promise<void>;
}

/**
 * Раздел «Доверенные устройства» — где код при входе больше не спрашивают.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЧЕМ ОН НУЖЕН И ПОЧЕМУ СТОИТ ПЕРВЫМ
 * ────────────────────────────────────────────────────────────────────────────
 * Список активных устройств отвечает на вопрос «где мой аккаунт открыт
 * сейчас». Этот — на вопрос куда более неприятный: «откуда в него смогут
 * войти, зная один только пароль». Второй вопрос важнее первого, потому что
 * чужая сессия закончится сама через неделю, а чужое доверенное устройство
 * будет пускать девяносто дней.
 *
 * Механизм доверия снимает второй фактор с ВХОДА и переносит его на
 * УСТРОЙСТВО (разбор — в modules/auth/lib/trustedDevice.ts). Такой размен
 * честен ровно до тех пор, пока владелец видит список устройств и может
 * вычеркнуть любое. Поэтому раздел не спрятан за ссылкой и не свёрнут: он
 * стоит над списком сессий, там же, куда ведут и письмо о новом входе, и
 * уведомление «устройство запомнено».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЗДЕСЬ ЕСТЬ «ОТОЗВАТЬ ВСЕ», А У СЕССИЙ — НЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * У сессий есть «выйти со всех устройств» в разделе безопасности, и второй
 * такой кнопки не нужно. А здесь это действие другое по смыслу: оно не
 * выкидывает никого из аккаунта, а возвращает запрос кода — то есть чинит
 * ситуацию «кажется, я входил с чужого компьютера» без потери текущей работы.
 * Его цена низкая (лишний код на следующем входе), поэтому оно и предложено
 * прямо, без подтверждения.
 */
export function TrustedDevicesSection({
	devices,
	onRevoke,
	onRevokeAll,
}: TrustedDevicesSectionProps) {
	const [revokingId, setRevokingId] = useState<string | null>(null);
	const [isRevokingAll, setIsRevokingAll] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleRevoke(deviceId: string) {
		setRevokingId(deviceId);
		setError(null);
		try {
			await onRevoke(deviceId);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Не удалось отозвать доверие. Попробуйте ещё раз.",
			);
		} finally {
			setRevokingId(null);
		}
	}

	async function handleRevokeAll() {
		setIsRevokingAll(true);
		setError(null);
		try {
			await onRevokeAll();
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Не удалось отозвать доверие. Попробуйте ещё раз.",
			);
		} finally {
			setIsRevokingAll(false);
		}
	}

	const busy = isRevokingAll || revokingId !== null;

	return (
		<section className={styles.section}>
			<div className={styles.sectionAside}>
				<h2 className={styles.sectionTitle}>Доверенные устройства</h2>
				<p className={styles.sectionHint}>
					С этих браузеров вход выполняется без одноразового кода — достаточно
					пароля. Код всё равно спросят при входе из другой сети, с другого
					браузера и после смены пароля.
				</p>
			</div>

			<div className={styles.sectionBody}>
				<div className={styles.listHead}>
					<p className={catalog.micro} role="status">
						{devices.length > 0
							? `${devices.length} ${plural(devices.length, "устройство", "устройства", "устройств")}`
							: "Доверенных устройств нет"}
					</p>

					{devices.length > 0 && (
						<button
							type="button"
							onClick={handleRevokeAll}
							disabled={busy}
							className={`${styles.btn} ${styles.btnQuiet} ${styles.btnSmall}`}
						>
							{isRevokingAll ? (
								<>
									<Loader2 size={14} aria-hidden className={styles.spin} />
									Отзываем
								</>
							) : (
								<>
									<ShieldOff size={14} aria-hidden />
									Отозвать все
								</>
							)}
						</button>
					)}
				</div>

				{error && (
					<p role="alert" className={`${styles.notice} ${styles.noticeError}`}>
						<AlertCircle
							size={15}
							aria-hidden
							className={`${styles.noticeIcon} ${styles.noticeErrorIcon}`}
						/>
						{error}
					</p>
				)}

				{devices.length === 0 ? (
					<div className={styles.empty}>
						<ShieldCheck
							size={26}
							strokeWidth={1.25}
							aria-hidden
							className="text-[var(--border-light)]"
						/>
						<p className={styles.emptyTitle}>Код спрашивают при каждом входе</p>
						<p className={styles.emptyText}>
							Устройство попадает сюда после того, как вы подтвердите с него
							вход одноразовым кодом.
						</p>
					</div>
				) : (
					<ul className={styles.rows}>
						{devices.map((device, index) => (
							<li
								key={device.deviceId}
								className={cn(
									styles.row,
									styles.rowEnter,
									device.isCurrent && styles.rowCurrent,
									revokingId === device.deviceId && styles.rowLeaving,
								)}
								style={{ "--i": index } as React.CSSProperties}
							>
								<span className={styles.rowIcon}>
									<ShieldCheck size={18} aria-hidden />
								</span>

								<div className={styles.rowMain}>
									<div className={styles.rowTitle}>
										<span
											className={styles.rowTitleText}
											title={device.deviceLabel}
										>
											{device.deviceLabel}
										</span>
										{device.isCurrent && (
											<span className={`${styles.chip} ${styles.chipOk}`}>
												Это устройство
											</span>
										)}
									</div>

									<dl className={styles.rowMeta}>
										{device.lastIp && (
											<div className={styles.rowMetaItem}>
												<MapPin size={12} aria-hidden className="shrink-0" />
												<dt className="sr-only">IP последнего входа</dt>
												<dd className="m-0">{device.lastIp}</dd>
											</div>
										)}
										<div className={styles.rowMetaItem}>
											<dt className="sr-only">Последний вход</dt>
											<dd className="m-0">
												вход {formatRelative(device.lastUsedAt)}
											</dd>
										</div>
										{/* Срок доверия — не украшение: он отвечает на вопрос
										    «это навсегда?». Ответ «нет, до такого-то числа»
										    снимает большую часть тревоги от самой идеи входа
										    без кода. */}
										<div className={styles.rowMetaItem}>
											<dt className="sr-only">Доверие истекает</dt>
											<dd className="m-0">до {formatDate(device.expiresAt)}</dd>
										</div>
									</dl>
								</div>

								<button
									type="button"
									onClick={() => handleRevoke(device.deviceId)}
									disabled={busy}
									// Имя устройства в подписи для скринридера: несколько
									// кнопок «Отозвать» подряд без него неразличимы.
									aria-label={`Отозвать доверие: ${device.deviceLabel}`}
									className={cn(
										styles.btn,
										styles.btnQuiet,
										styles.btnSmall,
										styles.rowAction,
									)}
								>
									{revokingId === device.deviceId ? (
										<>
											<Loader2 size={14} aria-hidden className={styles.spin} />
											Отзываем
										</>
									) : (
										"Отозвать"
									)}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}

export default TrustedDevicesSection;
