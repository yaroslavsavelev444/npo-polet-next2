"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { Modal } from "@/UI";
import { pluralizeItems } from "../lib/format";
import styles from "./Wishlist.module.css";

interface ClearWishlistDialogProps {
	open: boolean;
	onClose: () => void;
	onConfirm: () => Promise<void>;
	/** Сколько позиций будет стёрто — число стоит прямо в тексте. */
	count: number;
}

/**
 * Подтверждение очистки избранного.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ОКНО ВООБЩЕ ПОЯВИЛОСЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Раньше «Очистить избранное» стирало список одним нажатием, без вопроса и
 * без возврата: сервер удаляет позиции, и восстановить их нечем — что было
 * отложено, знал только сам список. Это единственное необратимое действие на
 * странице, и ровно такому подтверждение и положено (а больше нигде здесь его
 * нет: убрать одну позицию сердечком обратимо тем же сердечком).
 *
 * Механика окна — общий UI/Modal: нативный <dialog> даёт ловушку фокуса,
 * возврат фокуса на кнопку-источник и закрытие по Escape. Материал — как у
 * окна выхода из кабинета: --void с тёплым пятном у верхнего края, потому что
 * слой над страницей не может быть светлее страницы.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ТЕКСТ И КНОПКИ
 * ────────────────────────────────────────────────────────────────────────────
 * В тексте стоит настоящее число позиций: «удалить 7 позиций» — это решение,
 * «очистить список» — это согласие не глядя. Красная кнопка здесь и только
 * здесь: в панели она пугала бы раньше времени, а тут действительно стирает.
 * Отмена стоит первой по порядку чтения и остаётся доступной, пока запрос не
 * ушёл.
 */
export function ClearWishlistDialog({
	open,
	onClose,
	onConfirm,
	count,
}: ClearWishlistDialogProps) {
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			await onConfirm();
		});
	}

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Очистить избранное?"
			width={420}
			closeOnOverlay={!isPending}
			closeOnEscape={!isPending}
			className={styles.dialog}
			footer={
				<div className={styles.dialogActions}>
					<button
						type="button"
						onClick={onClose}
						disabled={isPending}
						className={`${styles.btn} ${styles.btnQuiet}`}
					>
						Отмена
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={isPending}
						className={`${styles.btn} ${styles.btnDanger}`}
					>
						{isPending ? (
							<Loader2 size={15} aria-hidden className={styles.spin} />
						) : (
							<Trash2 size={15} aria-hidden />
						)}
						{isPending ? "Очищаем…" : "Удалить всё"}
					</button>
				</div>
			}
		>
			<div className={styles.dialogBody}>
				<p className={styles.dialogText}>
					Из избранного пропадут все {count} {pluralizeItems(count)}. Вернуть
					список одним действием не получится — товары придётся отметить
					сердечком заново.
				</p>
				<p className={styles.dialogText}>На корзину и заказы это не влияет.</p>
			</div>
		</Modal>
	);
}

export default ClearWishlistDialog;
