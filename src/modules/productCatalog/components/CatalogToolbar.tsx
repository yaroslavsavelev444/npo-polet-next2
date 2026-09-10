"use client";

import {
	ArrowDownUp,
	PackageCheck,
	RotateCcw,
	SlidersHorizontal,
	Tag,
	X,
} from "lucide-react";
import { formatPrice } from "@/modules/productCard";
import { useProductFilters } from "../hooks/useProductFilters";
import { pluralizeProducts, statusLabel } from "../lib/catalogOptions";
import type { PriceBounds } from "../types/filters";
import styles from "./Catalog.module.css";
import { CatalogPopover } from "./CatalogPopover";
import { PriceFilter } from "./PriceFilter";
import { SortMenu } from "./SortMenu";
import { StatusFilter } from "./StatusFilter";

interface CatalogToolbarProps {
	totalDocs: number;
	priceBounds: PriceBounds;
	onOpenFilters: () => void;
	onOpenSort: () => void;
}

/**
 * Единственный орган управления каталогом: сводка слева, фильтры и сортировка
 * справа. Панель липкая и садится ровно под шапку сайта — на выдаче в
 * несколько экранов управление обязано оставаться под рукой, а не оставаться
 * наверху.
 *
 * ─── Почему фильтры здесь, а не в боковой колонке ───────────────────────────
 * У этого каталога ровно два измерения фильтрации: цена и наличие. Боковая
 * колонка в 17–19rem под два органа управления — это четверть ширины страницы
 * ради двух строк: снизу колонка пустая, а сетка теряет колонку товаров
 * (четыре вместо пяти на 1440px). Горизонтальная панель отдаёт сетке всю
 * ширину и собирает управление в одном месте — том же, куда смотрят на
 * телефоне.
 *
 * Каноничность здесь именно в этом: боковая панель канонична там, где
 * фильтров десять и они с фасетами. Под два фильтра канонична панель.
 *
 * ─── Десктоп и телефон — разные интерфейсы, а не масштаб ────────────────────
 * На широком экране наличие развёрнуто в сегментированный переключатель прямо
 * в панели (один клик), цена — в поповере у своей кнопки, сортировка — в меню
 * у своей. На узком всё это ушло в нижние листы: там управление занимает всю
 * ширину, строки набраны под палец, а панель остаётся в одну строку и не
 * съедает высоту экрана.
 */
export function CatalogToolbar({
	totalDocs,
	priceBounds,
	onOpenFilters,
	onOpenSort,
}: CatalogToolbarProps) {
	const { filters, updateFilters, resetFilters, activeFiltersCount } =
		useProductFilters();

	const hasPriceFilter =
		filters.priceFrom !== undefined || filters.priceTo !== undefined;
	const hasStatusFilter = filters.status !== "all";
	const hasPriceRange =
		totalDocs > 0 && priceBounds.max > 0 && priceBounds.max > priceBounds.min;

	const priceChipLabel = `${
		filters.priceFrom !== undefined ? formatPrice(filters.priceFrom) : "от 0"
	} — ${filters.priceTo !== undefined ? formatPrice(filters.priceTo) : "∞"}`;

	return (
		<div className={styles.rail}>
			<div className={styles.railRow}>
				<p className={styles.summary}>
					<span className={styles.summaryValue}>{totalDocs}</span>
					<span className={styles.micro}>{pluralizeProducts(totalDocs)}</span>
				</p>

				{hasPriceRange && (
					<p className={`${styles.micro} ${styles.summaryRange}`}>
						{formatPrice(priceBounds.min)} — {formatPrice(priceBounds.max)}
					</p>
				)}

				<span className={styles.railSpacer} />

				{/* Десктоп: управление развёрнуто в панели */}
				<div className="hidden shrink-0 items-center gap-2 lg:flex">
					{/* Наличие раскрывается в сегментированный переключатель только
					    там, где для него действительно есть место. Между 1024 и 1280
					    четыре варианта вместе со сводкой, ценой и сортировкой не
					    влезали в строку и давали горизонтальную прокрутку всей
					    страницы; там наличие живёт в поповере ровно того же вида,
					    что и цена. Ниже 1024 оба фильтра уходят в нижний лист.

					    Обёртки — обычные div без классов модуля: правила display из
					    CSS-модуля перебивают утилиты Tailwind (модуль не в слое, см.
					    шапку globals.css), и hidden/xl:hidden на самом элементе
					    молча не срабатывали бы. */}
					<div className="hidden shrink-0 xl:block">
						<StatusFilter variant="segmented" />
					</div>

					<div className="shrink-0 xl:hidden">
						<CatalogPopover
							align="start"
							active={hasStatusFilter}
							label="Фильтр по наличию"
							trigger={
								<>
									<PackageCheck
										size={14}
										aria-hidden
										className={styles.controlIcon}
									/>
									{hasStatusFilter ? statusLabel(filters.status) : "Наличие"}
								</>
							}
						>
							<StatusFilter variant="list" />
						</CatalogPopover>
					</div>

					<CatalogPopover
						align="start"
						active={hasPriceFilter}
						label="Фильтр по цене"
						trigger={
							<>
								<Tag size={14} aria-hidden className={styles.controlIcon} />
								{hasPriceFilter ? priceChipLabel : "Цена"}
							</>
						}
					>
						<PriceFilter priceBounds={priceBounds} showLabel={false} />
					</CatalogPopover>

					{/* Сброс появляется только когда есть что сбрасывать, и стоит в
					    группе фильтров, а не рядом с сортировкой: сортировка не
					    сбрасывается. */}
					{activeFiltersCount > 0 && (
						<button
							type="button"
							onClick={resetFilters}
							aria-label="Сбросить все фильтры"
							title="Сбросить все фильтры"
							className={styles.controlIconOnly}
						>
							<RotateCcw size={14} aria-hidden />
						</button>
					)}

					<span className={styles.railDivider} />

					<SortMenu />
				</div>

				{/* Телефон и планшет: управление живёт в нижних листах */}
				<div className="flex shrink-0 items-center gap-2 lg:hidden">
					<button
						type="button"
						onClick={onOpenSort}
						aria-label="Сортировка"
						className={`${styles.control} ${styles.controlCompact}`}
					>
						<ArrowDownUp size={14} aria-hidden className={styles.controlIcon} />
						<span className={styles.controlText}>Сортировка</span>
					</button>

					<button
						type="button"
						onClick={onOpenFilters}
						aria-label="Фильтры"
						data-active={activeFiltersCount > 0 || undefined}
						className={styles.control}
					>
						<SlidersHorizontal
							size={14}
							aria-hidden
							className={styles.controlIcon}
						/>
						Фильтры
						{activeFiltersCount > 0 && (
							<span className={styles.controlBadge}>{activeFiltersCount}</span>
						)}
					</button>
				</div>
			</div>

			{/* Строка активных фильтров — ТОЛЬКО на узком экране. На десктопе
			    состояние уже напечатано на самих органах управления (залитый
			    сегмент наличия, диапазон на кнопке цены), и чипы повторяли бы то
			    же самое второй строкой; сброс там живёт кнопкой в панели. На
			    телефоне управление спрятано в листах, и чипы — единственное
			    место, где видно, что выдача сужена, и единственный способ снять
			    фильтр по одному.

			    Строка появляется только когда есть что снимать, поэтому у панели
			    два роста — и потому она проявляется, а не возникает рывком. */}
			{activeFiltersCount > 0 && (
				<div className={styles.activeRow}>
					{hasPriceFilter && (
						<span className={styles.activeChip}>
							{priceChipLabel}
							<button
								type="button"
								onClick={() =>
									updateFilters({ priceFrom: undefined, priceTo: undefined })
								}
								aria-label={`Убрать фильтр по цене: ${priceChipLabel}`}
								className={styles.activeChipRemove}
							>
								<X size={11} aria-hidden />
							</button>
						</span>
					)}

					{hasStatusFilter && (
						<span className={styles.activeChip}>
							{statusLabel(filters.status)}
							<button
								type="button"
								onClick={() => updateFilters({ status: "all" })}
								aria-label={`Убрать фильтр: ${statusLabel(filters.status)}`}
								className={styles.activeChipRemove}
							>
								<X size={11} aria-hidden />
							</button>
						</span>
					)}

					<button
						type="button"
						onClick={resetFilters}
						className={styles.resetLink}
					>
						Сбросить всё
					</button>
				</div>
			)}
		</div>
	);
}

export default CatalogToolbar;
