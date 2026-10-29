import type { ReactNode } from "react";
import {
	type BreadcrumbItem,
	Breadcrumbs,
} from "@/components/Breadcrumbs/Breadcrumbs";
import { RevealLines } from "@/shared/components/motion/Reveal";
import { cn } from "@/utils/cn";
import styles from "./Consents.module.css";

/**
 * Первый экран раздела — та же полоса, что открывает кабинет, контакты и
 * витрину каталога: --void-deep на всю ширину, один радиальный источник
 * снизу слева, волосяной шов по нижнему краю. Соглашения входят в тот же
 * ярус сайта и обязаны иметь такой же вес.
 *
 * Заголовок — единственное авторское движение страницы: строка проявляется
 * срезом, как заголовки главной. Всё ниже появляется без эффектов — это
 * текст для чтения, и он должен быть на месте сразу.
 */
export function ConsentHero({
	breadcrumbs,
	title,
	variant,
	children,
}: {
	breadcrumbs: BreadcrumbItem[];
	title: string;
	variant: "index" | "document";
	children?: ReactNode;
}) {
	return (
		<section className={styles.hero}>
			<div className={styles.heroGlow} aria-hidden="true" />
			<div className={styles.heroSeam} aria-hidden="true" />

			<div className={cn(styles.container, styles.heroInner)}>
				<Breadcrumbs items={breadcrumbs} />

				<h1
					className={cn(
						"u-display",
						variant === "index" ? styles.titleIndex : styles.titleDocument,
					)}
				>
					<RevealLines lines={[title]} />
				</h1>

				{children}
			</div>
		</section>
	);
}
