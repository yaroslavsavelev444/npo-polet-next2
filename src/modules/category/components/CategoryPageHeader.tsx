import {
	type BreadcrumbItem,
	Breadcrumbs,
} from "@/components/Breadcrumbs/Breadcrumbs";

interface CategoryPageHeaderProps {
	name: string;
	description?: string | null;
	breadcrumbs: BreadcrumbItem[];
}

/**
 * Шапка страницы категории: путь → название → пояснение.
 *
 * Прошлая версия складывалась из трёх независимых кусков — «таблетка» с
 * хлебными крошками, заголовок с описанием и, через большой разрыв, панель с
 * числом товаров и сортировкой. Три блока, ни один из которых не объяснял два
 * других.
 *
 * Здесь остаётся только то, что описывает саму категорию, с одной осью
 * выравнивания и понижающимся весом. Всё, что описывает выдачу (сколько
 * позиций, в каком диапазоне цен, как отсортированы), ушло в липкую панель
 * каталога: это подпись к списку, а не второй заголовок страницы.
 *
 * Описание печатается только если оно не повторяет название: у большинства
 * категорий в базе description дублирует name, и на экране это выглядело как
 * ошибка вёрстки.
 */
export function CategoryPageHeader({
	name,
	description,
	breadcrumbs,
}: CategoryPageHeaderProps) {
	const cleanDescription = description?.trim();
	const showDescription =
		!!cleanDescription &&
		cleanDescription.toLowerCase() !== name.trim().toLowerCase();

	return (
		<header className="flex flex-col">
			<Breadcrumbs items={breadcrumbs} />

			{/* text-balance держит длинное название категории в 2–3 соразмерных
			    строках вместо «лесенки» с одиноким словом внизу. */}
			<h1 className="mt-3 max-w-[52rem] text-balance text-[26px] font-bold leading-[1.12] tracking-[-0.03em] text-[var(--text-primary)] sm:mt-[1rem] sm:text-[34px] lg:text-[40px]">
				{name}
			</h1>

			{showDescription && (
				<p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[var(--text-secondary)]">
					{cleanDescription}
				</p>
			)}
		</header>
	);
}
