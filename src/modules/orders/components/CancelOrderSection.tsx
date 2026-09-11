"use client";

import { AlertCircle, Loader2, XCircle } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { appToast } from "@/shared/lib/toast";
import { cancelOrderAction } from "../actions/orders.actions";
import type { OrderStatus } from "../types";
import styles from "./Orders.module.css";

interface Props {
	orderId: string;
	orderNumber: string;
	canCancel: boolean;
	onCancelled: (status: OrderStatus) => void;
}

/** Минимальная длина причины — то же правило, что проверяет сервер. */
const REASON_MIN = 5;
const REASON_MAX = 500;

/**
 * Отмена заказа.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДВА ШАГА, А НЕ ОДИН
 * ────────────────────────────────────────────────────────────────────────────
 * Отмена необратима, поэтому кнопка не отменяет заказ — она раскрывает форму
 * с обязательной причиной. Причина здесь не бюрократия: её требует сервер
 * (cancelOrderAction), она попадает в историю статусов и объясняет менеджеру,
 * что пошло не так. Заодно необходимость написать пару слов — естественная
 * пауза перед необратимым действием.
 *
 * Порог в 5 символов повторён на клиенте ровно потому, что он есть на
 * сервере: отправить и получить отказ — худший способ узнать, что причина
 * слишком короткая. Кнопка при этом не просто выключена — рядом видно,
 * сколько символов не хватает.
 *
 * Подтверждение стоит слева, отказ — справа, и отказ не выглядит опасным:
 * промахнуться мимо «Не отменять» должно быть безобиднее, чем мимо
 * «Подтвердить».
 */
export function CancelOrderSection({
	orderId,
	orderNumber,
	canCancel,
	onCancelled,
}: Props) {
	const [isOpen, setIsOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const reasonId = useId();

	if (!canCancel) return null;

	const trimmed = reason.trim();
	const missing = Math.max(0, REASON_MIN - trimmed.length);

	function handleSubmit() {
		setError(null);
		startTransition(async () => {
			const result = await cancelOrderAction(orderId, reason);
			if (!result.success) {
				setError(result.message);
				return;
			}
			appToast.success(`Заказ № ${orderNumber} отменён`);
			onCancelled(result.data.status);
		});
	}

	if (!isOpen) {
		return (
			<div className={styles.actions}>
				<button
					type="button"
					onClick={() => setIsOpen(true)}
					className={`${styles.btn} ${styles.btnDanger}`}
				>
					<XCircle size={15} aria-hidden />
					Отменить заказ
				</button>
			</div>
		);
	}

	return (
		<div className={styles.cancelForm}>
			<p className={`${styles.notice} ${styles.noticeWarn}`}>
				<AlertCircle
					size={15}
					aria-hidden
					className={`${styles.noticeIcon} ${styles.noticeWarnIcon}`}
				/>
				Отмена необратима: вернуть заказ в работу можно будет только новым
				заказом. Уже оплаченные суммы возвращает менеджер.
			</p>

			<div className={styles.textareaField}>
				<label htmlFor={reasonId} className={styles.textareaLabel}>
					<span>Причина отмены</span>
					<span>
						{missing > 0
							? `ещё ${missing}`
							: `${trimmed.length} / ${REASON_MAX}`}
					</span>
				</label>
				<textarea
					id={reasonId}
					value={reason}
					onChange={(event) => {
						setReason(event.target.value);
						if (error) setError(null);
					}}
					maxLength={REASON_MAX}
					rows={3}
					placeholder="Например: ошибся с количеством, оформлю заново"
					disabled={isPending}
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? `${reasonId}-error` : undefined}
					className={styles.textarea}
				/>
				{error && (
					<p
						id={`${reasonId}-error`}
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
			</div>

			<div className={styles.actions}>
				<button
					type="button"
					onClick={handleSubmit}
					disabled={isPending || missing > 0}
					className={`${styles.btn} ${styles.btnDanger}`}
				>
					{isPending ? (
						<Loader2 size={15} aria-hidden className={styles.spin} />
					) : (
						<XCircle size={15} aria-hidden />
					)}
					{isPending ? "Отменяем…" : "Подтвердить отмену"}
				</button>

				<button
					type="button"
					onClick={() => {
						setIsOpen(false);
						setReason("");
						setError(null);
					}}
					disabled={isPending}
					className={`${styles.btn} ${styles.btnQuiet}`}
				>
					Не отменять
				</button>
			</div>
		</div>
	);
}

export default CancelOrderSection;
