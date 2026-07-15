"use client";

import { Button, Drawer } from "@/UI";
import type { PriceBounds } from "../types/filters";
import { FiltersPanel } from "./FiltersPanel";

interface Props {
	open: boolean;
	onClose: () => void;
	priceBounds: PriceBounds;
	resultCount: number;
}

export function MobileFiltersSheet({
	open,
	onClose,
	priceBounds,
	resultCount,
}: Props) {
	return (
		<Drawer
			open={open}
			onClose={onClose}
			title="Фильтры"
			placement="bottom"
			size="min(88vh, 640px)"
			className="overflow-hidden rounded-t-[var(--radius-lg)]"
			footer={
				<Button variant="primary" size="lg" fullWidth onClick={onClose}>
					Показать {resultCount} {resultCount === 1 ? "товар" : "товаров"}
				</Button>
			}
		>
			<FiltersPanel priceBounds={priceBounds} />
		</Drawer>
	);
}

export default MobileFiltersSheet;
