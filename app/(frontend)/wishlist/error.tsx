"use client";

import { CloudOff, LayoutGrid, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { logError } from "@/modules/error";
import styles from "@/modules/wishlist/components/Wishlist.module.css";
import { WishlistHero } from "@/modules/wishlist/components/WishlistHero";
import { PageContainer } from "@/shared/components/PageContainer";

const BREADCRUMBS = [
	{ title: "Главная", href: "/" },
	{ title: "Личный кабинет", href: "/profile" },
	{ title: "Избранное", href: "/wishlist" },
];

/**
 * Избранное не загрузилось.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ НЕ ОБЩАЯ СТРАНИЦА ОШИБКИ
 * ────────────────────────────────────────────────────────────────────────────
 * Общий error.tsx витрины заменяет собой ВСЁ — вместе с шапкой раздела и
 * цепочкой. Посетитель, нажавший «Избранное», получал бы страницу «500», по
 * которой непонятно даже, куда он шёл. Здесь первый экран остаётся на месте:
 * раздел тот же, просто список сейчас недоступен.
 *
 * Сбой ЛОКАЛЬНЫЙ и почти всегда временный (обрыв связи, перезапуск базы),
 * поэтому главное действие — повторить: reset() перезапускает серверную
 * отрисовку сегмента, без перезагрузки всей вкладки. Второе действие ведёт в
 * каталог: если список не поднимется и со второй попытки, тупика быть не
 * должно.
 *
 * Технический текст ошибки посетителю не показывается — он уходит в
 * logError вместе с местом, где возник. На экране остаётся причина на
 * человеческом языке и следующий шаг.
 */
export default function WishlistError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		logError(error, { component: "wishlist-page" });
	}, [error]);

	return (
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			{/* Счётчики нулевые: сколько отложено, сейчас неизвестно, и придумывать
			    число нельзя. При total = 0 первый экран сам показывает поясняющую
			    строку вместо сводки. */}
			<WishlistHero breadcrumbs={BREADCRUMBS} total={0} available={0} />

			<PageContainer className="pb-[4rem]">
				<div className="mt-[clamp(2rem,4vw,3rem)]">
					<div className={styles.empty} role="alert">
						<span
							className={`${styles.emptyMark} ${styles.emptyMarkError}`}
							aria-hidden="true"
						>
							<CloudOff size={22} strokeWidth={1.5} />
						</span>

						<h2 className={styles.emptyTitle}>Не удалось открыть избранное</h2>

						<p className={styles.emptyText}>
							Список не загрузился — похоже, пропала связь с сервером. Сами
							товары никуда не делись: попробуйте ещё раз.
						</p>

						<div className={styles.emptyActions}>
							<button
								type="button"
								onClick={reset}
								className={`${styles.btn} ${styles.btnPrimary}`}
							>
								<RotateCw size={15} aria-hidden />
								Повторить
							</button>

							<Link
								href="/category"
								className={`${styles.btn} ${styles.btnQuiet}`}
							>
								<LayoutGrid size={15} aria-hidden />
								Перейти в каталог
							</Link>
						</div>
					</div>
				</div>
			</PageContainer>
		</main>
	);
}
