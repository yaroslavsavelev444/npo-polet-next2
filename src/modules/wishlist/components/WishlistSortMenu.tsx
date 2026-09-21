"use client";

import { ArrowDownUp } from "lucide-react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { CatalogPopover } from "@/modules/productCatalog/components/CatalogPopover";
import {
	findWishlistSortOption,
	WISHLIST_SORT_OPTIONS,
	type WishlistSortValue,
} from "../lib/sort";
import styles from "./Wishlist.module.css";

interface WishlistSortMenuProps {
	value: WishlistSortValue;
	onChange: (value: WishlistSortValue) => void;
}

/**
 * Порядок показа избранного.
 *
 * Механика и вид взяты у сортировки каталога целиком: та же всплывающая
 * панель (CatalogPopover), те же классы кнопки и списка, та же пометка
 * выбранного пункта чертой СЛЕВА — там, где начинается чтение. Две разные
 * сортировки на одном сайте выглядели бы как две разные системы.
 *
 * Свой компонент, а не SortMenu каталога, по одной причине: тот пишет выбор в
 * адрес страницы через useProductFilters. Избранное — личный список, а не
 * выдача, которой делятся ссылкой; параметр в адресе оставлял бы мусор в
 * истории браузера и требовал бы серверного круга там, где всё уже в памяти
 * вкладки. Общее у двух сортировок — оформление, и оно переиспользовано;
 * различается источник состояния, и он здесь свой.
 *
 * Роль menu/menuitemradio, а не listbox: выбор меняет порядок сразу по
 * нажатию, это команда, а не поле формы.
 */
export function WishlistSortMenu({ value, onChange }: WishlistSortMenuProps) {
	const current = findWishlistSortOption(value);

	return (
		<CatalogPopover
			align="end"
			label={`Сортировка: ${current.label}`}
			panelClassName={catalog.menu}
			trigger={
				<>
					<ArrowDownUp size={14} aria-hidden className={catalog.controlIcon} />
					<span className={`${catalog.controlLabel} ${styles.sortLabel}`}>
						Сортировка:
					</span>
					<span className={`${catalog.controlValue} ${styles.sortValue}`}>
						{current.label}
					</span>
				</>
			}
		>
			{(close) => (
				<div role="menu" aria-label="Сортировка избранного">
					{WISHLIST_SORT_OPTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							role="menuitemradio"
							aria-checked={option.value === current.value}
							onClick={() => {
								onChange(option.value);
								close();
							}}
							className={catalog.menuOption}
						>
							<span aria-hidden className={catalog.menuMark} />
							{option.label}
						</button>
					))}
				</div>
			)}
		</CatalogPopover>
	);
}

export default WishlistSortMenu;
