import {
	type BreadcrumbItem,
	Breadcrumbs,
} from "@/components/Breadcrumbs/Breadcrumbs";
import styles from "@/modules/productCatalog/components/Catalog.module.css";

interface CategoryPageHeaderProps {
	name: string;
	description?: string | null;
	breadcrumbs: BreadcrumbItem[];
}

/**
 * Шапка страницы категории: путь → название → пояснение.
 *
 * Название набрано акцидентной PaluiSP2 (класс .u-display поднимает регистр и
 * включает словарный перенос) — той же гарнитурой, что несёт первый экран
 * главной, названия направлений и пункты мобильного меню. Это не подстановка
 * шрифта вместо прежнего: у гарнитуры другая ширина знака и другая капитель,
 * поэтому у заголовка здесь свой кегль, свой интерлиньяж и своя мера строки
 * (см. .title в Catalog.module.css).
 *
 * Раскладка — две колонки на широком экране: слева название, справа
 * пояснение. У PaluiSP2 знак занимает ~1.2em, и поставленное ПОД таким
 * заголовком описание в мелком Manrope выглядело бы подписью к плакату; рядом
 * же оно читается как вторая колонка разворота, и обе получают нормальную
 * меру строки. На узком экране колонки складываются в одну.
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

			<div className="mt-5 flex flex-col gap-5 sm:mt-[2rem] lg:flex-row lg:items-end lg:gap-[3rem]">
				{/* Заголовку отдана вся оставшаяся ширина, а пояснению — колонка
				    фиксированной меры. При свободном распределении flex делил ряд по
				    содержимому, и колонка заголовка оказывалась на десяток пикселей
				    уже самого длинного слова — из-за этого «СТАЦИОНАРНЫЕ» уходило в
				    перенос по слогам там, где оно помещалось целиком. */}
				<h1 className={`u-display min-w-0 flex-1 ${styles.title}`}>{name}</h1>

				{showDescription && (
					/* Пояснение прижато к нижней линии заголовка (items-end), а не к
					   верхней: у капители PaluiSP2 верх строки на глаз выше, чем у
					   Manrope, и выравнивание по верху давало заметный уступ. */
					<p
						className={`${styles.lede} lg:w-[24rem] lg:shrink-0 lg:pb-[0.35rem]`}
					>
						{cleanDescription}
					</p>
				)}
			</div>
		</header>
	);
}
