import { PackageSearch, PackageX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/modules/orders/components/Orders.module.css";
import { PageContainer } from "@/shared/components/PageContainer";

export const metadata: Metadata = {
	title: "Заказ не найден",
	robots: { index: false, follow: false },
};

/**
 * Заказа с таким номером у покупателя нет.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ СВОЯ СТРАНИЦА, А НЕ ОБЩАЯ 404
 * ────────────────────────────────────────────────────────────────────────────
 * Общая «Страница не найдена» отвечает не на тот вопрос. Сюда приходят с
 * номером заказа в руках — из письма, из закладки, из чужого сообщения, — и
 * человеку нужно знать не «такой страницы нет», а «такого заказа у вас нет»
 * и куда идти за своими.
 *
 * Формулировка намеренно не различает «заказа не существует» и «заказ чужой»:
 * ответы обязаны быть неотличимы, иначе по ним перебором проверяют, какие
 * номера заказов существуют. Список своих заказов рядом — ровно то место, где
 * настоящий номер найдётся за одно нажатие.
 */
export default function OrderNotFound() {
	return (
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<PageContainer className={styles.pageBody}>
				<div className={styles.empty}>
					<PackageX
						size={28}
						strokeWidth={1.25}
						aria-hidden
						className="text-[var(--border-light)]"
					/>
					<p className={styles.emptyTitle}>Заказ не найден</p>
					<p className={styles.emptyText}>
						Заказа с таким номером в вашем аккаунте нет. Возможно, в ссылке
						опечатка или заказ оформлен под другим аккаунтом — проверьте номер в
						списке своих заказов.
					</p>
					<Link
						href="/orders"
						className={`${styles.btn} ${styles.btnPrimary}`}
						style={{ marginTop: "0.5rem" }}
					>
						<PackageSearch size={16} aria-hidden />
						Мои заказы
					</Link>
				</div>
			</PageContainer>
		</main>
	);
}
