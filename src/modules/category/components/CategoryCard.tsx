"use client";

import { ArrowUpRight, Layers } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { pluralizeProducts } from "@/modules/productCatalog/lib/catalogOptions";
import { useReveal } from "@/shared/components/motion/Reveal";
import type { CategoryCardData } from "../types/filters";
import styles from "./CategoryCatalog.module.css";

interface CategoryCardProps {
	category: CategoryCardData;
	/** Порядковый номер в выдаче — по нему считается сдвиг каскада. */
	index: number;
	/** Первые кадры грузятся приоритетно: это вероятный LCP. */
	priority?: boolean;
	/**
	 * Каскад при появлении. Отключается после первого же уточнения поиска:
	 * при вводе карточка обязана появляться сразу, иначе задержка читается
	 * как тормоза интерфейса, а не как приём.
	 */
	stagger?: boolean;
}

/**
 * Карточка раздела каталога.
 *
 * Устроена как карточка товара — кадр на плашке, слот названия, нижняя
 * строка сводки, — и это сделано намеренно: два яруса каталога обязаны
 * читаться как один интерфейс, где верхний просто крупнее. Отличий ровно
 * два, и оба продиктованы содержимым:
 *
 *   • вместо цены в нижней строке стоит число позиций — единственная
 *     величина, по которой раздел можно сравнить с соседним;
 *   • вместо кнопки «в корзину» — стрелка перехода: у раздела одно действие.
 *
 * Появление — общий для сайта «захват» (см. [data-reveal] в home.css),
 * вариант soft: без среза по краю, потому что срез по границе кадра читается
 * как обрезка снимка, а не как приём.
 *
 * Сам <li> и есть наблюдаемый элемент: обёртка вокруг него сломала бы сетку
 * (grid-элементом стала бы она, а не карточка).
 */
export function CategoryCard({
	category,
	index,
	priority = false,
	stagger = true,
}: CategoryCardProps) {
	const { ref, props } = useReveal<HTMLLIElement>("soft", {
		// Потолок на десятой позиции: дальше каскад всё равно не виден целиком
		// (карточки ниже кадра), а задержка в секунду на двадцатой карточке
		// означала бы, что она проявляется уже после того, как до неё
		// докрутили.
		delay: stagger ? Math.min(index, 9) * 45 : 0,
	});

	const { image, productCount } = category;
	const hasProducts = productCount > 0;

	return (
		<li ref={ref} {...props}>
			<Link
				href={category.href}
				aria-label={`Открыть раздел «${category.name}»`}
				className={styles.card}
			>
				<div className={styles.frame}>
					{image ? (
						<Image
							src={image.url}
							alt={image.alt || category.name}
							fill
							priority={priority}
							loading={priority ? "eager" : "lazy"}
							sizes="(max-width: 44rem) 50vw, (max-width: 66rem) 33vw, 320px"
							className={styles.image}
						/>
					) : (
						<div className={styles.imageEmpty}>
							<Layers size={36} strokeWidth={1.25} aria-hidden />
						</div>
					)}
				</div>

				<div className={styles.body}>
					{/* title — на случай, когда длинное название обрезано: наведение
					    показывает его целиком. Скринридеру оно и так читается
					    полностью из aria-label ссылки. */}
					<h3 className={styles.name} title={category.name}>
						{category.name}
					</h3>

					{category.subtitle && (
						<p className={styles.subtitle}>{category.subtitle}</p>
					)}

					<div className={styles.foot}>
						<span
							className={`${catalog.micro} ${styles.count} ${
								hasProducts ? "" : styles.countEmpty
							}`}
						>
							{hasProducts
								? `${productCount} ${pluralizeProducts(productCount)}`
								: "Скоро"}
						</span>

						<ArrowUpRight
							size={16}
							strokeWidth={1.75}
							aria-hidden
							className={styles.go}
						/>
					</div>
				</div>
			</Link>
		</li>
	);
}

export default CategoryCard;
