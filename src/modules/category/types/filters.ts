export type CategorySortField = "order" | "name" | "createdAt";
export type CategorySortOrder = "asc" | "desc";

export interface CategoryFilters {
	q?: string;
	field: CategorySortField;
	order: CategorySortOrder;
}

/**
 * Раздел каталога в том виде, в каком его показывает витрина.
 *
 * Отдельная форма, а не Category из payload-types, по двум причинам.
 *
 * Первая — вес. Отбор и поиск по разделам идут на клиенте (см.
 * CategoryCatalogView), то есть весь список уезжает в RSC-payload. У Category
 * помимо нужного лежат метаописания, ключевые слова, legacyId и полный
 * документ Media — это в несколько раз больше байтов на то же число
 * разделов.
 *
 * Вторая — поиск. Строка, по которой ищут, склеивается и приводится к нижнему
 * регистру ОДИН РАЗ на сервере. Иначе это происходило бы на каждое нажатие
 * клавиши для каждого раздела.
 */
export interface CategoryCardData {
	id: string;
	name: string;
	slug: string;
	href: string;
	subtitle?: string;
	image: { url: string; alt: string } | null;
	/** Число видимых позиций в разделе; 0 — раздел ещё не наполнен. */
	productCount: number;
	/** Поля сортировки, вынесенные из документа. */
	order: number;
	createdAt: number;
	/** Склейка названия, подписи, описания, slug и ключевых слов, в нижнем
	 *  регистре — единственное, по чему ищет локальный поиск. */
	search: string;
}
