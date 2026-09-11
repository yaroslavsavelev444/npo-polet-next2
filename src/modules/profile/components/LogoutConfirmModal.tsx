"use client";

import { Loader2, LogOut } from "lucide-react";
import { useTransition } from "react";
import { Modal } from "@/UI";
import styles from "./Profile.module.css";

interface LogoutConfirmModalProps {
	open: boolean;
	onClose: () => void;
	onConfirm: () => Promise<void>;
	/** Число устройств, которые ОСТАНУТСЯ в аккаунте после выхода. */
	remainingDevices: number;
}

/**
 * Подтверждение выхода.
 *
 * Механика окна берётся у общего UI/Modal: нативный <dialog> даёт ловушку
 * фокуса, возврат фокуса на кнопку-источник и закрытие по Escape без единой
 * строки своего кода, а RemoveScroll держит страницу под ним. Переписывать
 * это ради вида было бы ошибкой.
 *
 * Меняется только материал: поверхность перекрашена в --void с тёплым пятном
 * у верхнего края — как у панели корзины, мобильного меню и нижнего листа
 * каталога. Слой над страницей не может быть светлее страницы.
 *
 * Текст отвечает на настоящий вопрос. Прежний обещал, что «все несохранённые
 * данные будут утеряны», — неправда: корзина переживает выход, а сессии на
 * других устройствах остаются активными. Здесь сказано ровно то, что
 * произойдёт.
 */
export function LogoutConfirmModal({
	open,
	onClose,
	onConfirm,
	remainingDevices,
}: LogoutConfirmModalProps) {
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			// Перехвата нет намеренно: действие завершается редиректом на вход,
			// и его нельзя «поймать» — Next выполняет переход сам.
			await onConfirm();
		});
	}

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Выйти из аккаунта?"
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
						Остаться
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={isPending}
						className={`${styles.btn} ${styles.btnPrimary}`}
					>
						{isPending ? (
							<Loader2 size={15} aria-hidden className={styles.spin} />
						) : (
							<LogOut size={15} aria-hidden />
						)}
						{isPending ? "Выходим…" : "Выйти"}
					</button>
				</div>
			}
		>
			<div className={styles.dialogBody}>
				<p className={styles.dialogText}>
					Сессия на этом устройстве будет завершена, и откроется страница входа.
					Корзина и избранное сохранятся.
				</p>

				{remainingDevices > 0 && (
					<p className={`${styles.notice} ${styles.noticeWarn}`}>
						На других устройствах ({remainingDevices}) вход останется активным.
						Завершить их можно в разделе «Устройства».
					</p>
				)}
			</div>
		</Modal>
	);
}

export default LogoutConfirmModal;
