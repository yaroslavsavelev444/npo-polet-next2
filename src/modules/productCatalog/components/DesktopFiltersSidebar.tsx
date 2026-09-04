import type { PriceBounds } from "../types/filters";
import { FiltersPanel } from "./FiltersPanel";

interface Props {
	priceBounds: PriceBounds;
}

/**
 * Боковая панель фильтров на десктопе.
 *
 * Раньше панель была завёрнута в тот же Card, что и товар: та же поверхность,
 * та же рамка, тот же радиус — и, стоя первой в ряду сетки, она читалась как
 * ещё одна карточка товара, только сломанная. Фильтры — это не контент, а
 * управление им, и выглядеть они должны как часть интерфейса страницы:
 * без поверхности, отделённые от выдачи одной вертикальной линией.
 */
export function DesktopFiltersSidebar({ priceBounds }: Props) {
	return (
		<div className="flex flex-col gap-5">
			{/* Заголовок панели набран иначе, чем подписи групп внутри неё
			    («Цена», «Наличие»): раньше и то и другое было мелким прописным
			    приглушённым текстом, и уровня в этой иерархии не было вовсе. */}
			<h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
				Фильтры
			</h2>
			<FiltersPanel priceBounds={priceBounds} />
		</div>
	);
}

export default DesktopFiltersSidebar;
