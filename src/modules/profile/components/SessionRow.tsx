"use client";

import {
	Clock,
	Loader2,
	MapPin,
	Monitor,
	Smartphone,
	Tablet,
} from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/utils/cn";
import type { ProfileSession } from "../types/profile.types";
import styles from "./Profile.module.css";
import { RelativeTime } from "./RelativeTime";

/**
 * Тип устройства по строке user-agent, разобранной на сервере.
 *
 * Значок здесь не украшение: в списке из пяти строк тип устройства — первое,
 * по чему ищут своё («телефон — это я, чужой ноутбук — нет»), и опознаётся он
 * силуэтом быстрее, чем чтением подписи.
 */
function DeviceIcon({ label }: { label: string }) {
	const lower = label.toLowerCase();

	if (/mobile|phone|android|iphone/.test(lower)) {
		return <Smartphone size={18} aria-hidden />;
	}
	if (/tablet|ipad/.test(lower)) {
		return <Tablet size={18} aria-hidden />;
	}
	return <Monitor size={18} aria-hidden />;
}

interface SessionRowProps {
	session: ProfileSession;
	index: number;
	onRevoke?: (id: string) => void;
	revoking?: boolean;
}

/**
 * Строка активного устройства.
 *
 * Раньше это была карточка: рамка, заливка --surface, скругление. В
 * обновлённой системе рамок нет — ни у карточки товара, ни у карточки раздела
 * каталога, — и десять обведённых прямоугольников в кабинете читались бы
 * решёткой, а не списком. Строку от строки отбивает волосяная линия, как
 * каналы связи на контактах.
 *
 * Текущее устройство помечено вертикальной чертой акцента слева — там же, где
 * отмечен выбранный пункт в меню сортировки каталога: глаз находит его по
 * левому краю, где начинается чтение, а не по правому, куда приходит
 * последним.
 */
export function SessionRow({
	session,
	index,
	onRevoke,
	revoking,
}: SessionRowProps) {
	return (
		<li
			className={cn(
				styles.row,
				styles.rowEnter,
				session.isCurrent && styles.rowCurrent,
				revoking && styles.rowLeaving,
			)}
			style={{ "--i": index } as CSSProperties}
		>
			<span className={styles.rowIcon}>
				<DeviceIcon label={session.deviceLabel} />
			</span>

			<div className={styles.rowMain}>
				<div className={styles.rowTitle}>
					<span className={styles.rowTitleText} title={session.deviceLabel}>
						{session.deviceLabel}
					</span>
					{session.isCurrent && (
						<span className={`${styles.chip} ${styles.chipOk}`}>
							Это устройство
						</span>
					)}
				</div>

				<dl className={styles.rowMeta}>
					{session.ip && (
						<div className={styles.rowMetaItem}>
							<MapPin size={12} aria-hidden className="shrink-0" />
							<dt className="sr-only">IP-адрес</dt>
							<dd className="m-0">{session.ip}</dd>
						</div>
					)}
					<div className={styles.rowMetaItem}>
						<Clock size={12} aria-hidden className="shrink-0" />
						<dt className="sr-only">Последняя активность</dt>
						<dd className="m-0">
							<RelativeTime iso={session.lastActiveAt} />
						</dd>
					</div>
				</dl>
			</div>

			{!session.isCurrent && onRevoke && (
				<button
					type="button"
					onClick={() => onRevoke(session.id)}
					disabled={revoking}
					// Имя устройства в подписи для скринридера: десять кнопок
					// «Завершить» подряд без него неразличимы.
					aria-label={`Завершить сессию: ${session.deviceLabel}`}
					className={cn(
						styles.btn,
						styles.btnQuiet,
						styles.btnSmall,
						styles.rowAction,
					)}
				>
					{revoking ? (
						<>
							<Loader2 size={14} aria-hidden className={styles.spin} />
							Завершаем
						</>
					) : (
						"Завершить"
					)}
				</button>
			)}
		</li>
	);
}

export default SessionRow;
