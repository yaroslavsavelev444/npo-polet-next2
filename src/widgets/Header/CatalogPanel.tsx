"use client";

import { ArrowRight, ArrowUpRight, ImageOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { pluralizeCategories } from "@/modules/category/lib/categoryOptions";
import { formatPrice } from "@/modules/productCard/lib/format";
import { pluralizeProducts } from "@/modules/productCatalog/lib/catalogOptions";
import { cn } from "@/utils/cn";
import type { CatalogMenuData, CatalogMenuSection } from "./catalog-menu";
import styles from "./NavMenus.module.css";

/**
 * Содержимое меню «Каталог».
 *
 * Слева — указатель разделов, справа — сцена выбранного раздела: его
 * название, подпись и несколько товаров с фотографиями. Наведение на строку
 * меняет сцену; клик по строке ведёт в раздел. Под указателем — «Весь
 * каталог»: главный выход меню, поэтому он набран кнопкой, а не ещё одной
 * строкой.
 *
 * Бегунок у строк — та же шкала с засечкой, что разлиновывает страницы:
 * он едет к наведённой строке, а не перескакивает, и глаз видит, откуда и
 * куда сменился выбор.
 *
 * Строка переключает сцену не сразу, а после короткой задержки: курсор,
 * идущий по диагонали от верхней строки к товарам, проезжает над нижними, и
 * мгновенное переключение подменяло бы сцену под ним. 60 мс — меньше, чем
 * человек задерживается на строке, которую выбирает, и больше, чем курсор
 * тратит на пролёт.
 */

const HOVER_SWITCH_MS = 60;

export function CatalogPanel({
	data,
	active,
	onNavigate,
}: {
	data: CatalogMenuData;
	/** Открыта ли панель сейчас — от этого зависит появление содержимого. */
	active: boolean;
	onNavigate: () => void;
}) {
	const { sections, totalProducts } = data;
	// Первым показывается раздел, где есть что показать: меню, открывшееся
	// пустой сценой, выглядело бы сломанным, хотя товары в каталоге есть.
	const [current, setCurrent] = useState(() =>
		Math.max(
			0,
			sections.findIndex((section) => section.products.length > 0),
		),
	);
	const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(
		() => () => {
			if (switchTimer.current) clearTimeout(switchTimer.current);
		},
		[],
	);

	const select = (index: number, immediate: boolean) => {
		if (switchTimer.current) clearTimeout(switchTimer.current);
		if (immediate) {
			setCurrent(index);
			return;
		}
		switchTimer.current = setTimeout(() => setCurrent(index), HOVER_SWITCH_MS);
	};

	return (
		<div className={styles.inner} data-shown={active ? "true" : "false"}>
			<div className={styles.catalog}>
				<nav className={styles.index} aria-label="Разделы каталога">
					<p
						className={cn(styles.label, styles.reveal)}
						style={{ "--i": 0 } as CSSProperties}
					>
						Разделы
						<span className={styles.labelCount}>{sections.length}</span>
					</p>

					{sections.length > 0 ? (
						<ul
							className={styles.sections}
							style={{ "--current": current } as CSSProperties}
							onPointerLeave={() => {
								if (switchTimer.current) clearTimeout(switchTimer.current);
							}}
						>
							<span className={styles.marker} aria-hidden="true" />
							{sections.map((section, index) => (
								<li
									key={section.id}
									className={styles.reveal}
									style={{ "--i": index + 1 } as CSSProperties}
								>
									<Link
										href={section.href}
										className={styles.row}
										title={section.name}
										data-current={index === current || undefined}
										onPointerEnter={(event) =>
											select(index, event.pointerType !== "mouse")
										}
										onFocus={() => select(index, true)}
										onClick={onNavigate}
									>
										<span className={styles.rowIndex} aria-hidden="true">
											{String(index + 1).padStart(2, "0")}
										</span>
										<span className={styles.rowName}>{section.name}</span>
										<span className={styles.rowCount}>
											{section.count > 0 ? section.count : "—"}
										</span>
									</Link>
								</li>
							))}
						</ul>
					) : null}

					<Link
						href="/category"
						className={cn(styles.cta, styles.reveal)}
						style={{ "--i": sections.length + 1 } as CSSProperties}
						onClick={onNavigate}
					>
						<span className={styles.ctaBody}>
							<span className={styles.ctaTitle}>Весь каталог</span>
							<span className={styles.ctaMeta}>
								{totalProducts} {pluralizeProducts(totalProducts)} ·{" "}
								{sections.length} {pluralizeCategories(sections.length)}
							</span>
						</span>
						<ArrowRight aria-hidden className={styles.ctaIcon} />
					</Link>
				</nav>

				<div className={styles.scenes}>
					{sections.map((section, index) => (
						<Scene
							key={section.id}
							section={section}
							current={index === current}
							onNavigate={onNavigate}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

function Scene({
	section,
	current,
	onNavigate,
}: {
	section: CatalogMenuSection;
	current: boolean;
	onNavigate: () => void;
}) {
	const hasProducts = section.products.length > 0;

	return (
		<section
			className={styles.scene}
			data-current={current ? "true" : "false"}
			aria-hidden={!current}
			inert={!current}
		>
			<header className={styles.sceneHead}>
				<div className={styles.sceneText}>
					<h3 className={styles.sceneTitle}>{section.name}</h3>
					{section.subtitle ? (
						<p className={styles.sceneSubtitle}>{section.subtitle}</p>
					) : null}
				</div>
				<Link
					href={section.href}
					className={styles.sceneLink}
					onClick={onNavigate}
				>
					Открыть раздел
					<ArrowUpRight aria-hidden className={styles.sceneLinkIcon} />
				</Link>
			</header>

			{hasProducts ? (
				<ul className={styles.tiles}>
					{section.products.map((product, index) => (
						<li
							key={product.id}
							className={styles.tileItem}
							style={{ "--t": index } as CSSProperties}
						>
							<Link
								href={product.href}
								className={styles.tile}
								onClick={onNavigate}
							>
								<span className={styles.tileFrame}>
									{product.image ? (
										<Image
											src={product.image.url}
											alt={product.image.alt}
											fill
											sizes="(min-width: 1024px) 18rem, 0px"
											className={styles.tileImage}
										/>
									) : (
										<ImageOff aria-hidden className={styles.tileEmpty} />
									)}
								</span>
								<span className={styles.tileTitle}>{product.title}</span>
								<span className={styles.tilePrice}>
									{formatPrice(product.price)}
									{product.oldPrice ? (
										<s className={styles.tileOldPrice}>
											{formatPrice(product.oldPrice)}
										</s>
									) : null}
								</span>
							</Link>
						</li>
					))}
				</ul>
			) : (
				// Раздел без товаров не притворяется пустой сеткой: если у него
				// есть снимок — показываем его, иначе честно говорим, что раздел
				// ещё наполняется.
				<Link href={section.href} className={styles.empty} onClick={onNavigate}>
					{section.image ? (
						<Image
							src={section.image.url}
							alt={section.image.alt || section.name}
							fill
							sizes="(min-width: 1024px) 40rem, 0px"
							className={styles.emptyImage}
						/>
					) : null}
					<span className={styles.emptyText}>
						Раздел наполняется — позиции появятся здесь
					</span>
				</Link>
			)}
		</section>
	);
}
