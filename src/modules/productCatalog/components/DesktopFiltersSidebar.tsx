import { SlidersHorizontal } from "lucide-react";
import { Card } from "@/UI";
import type { PriceBounds } from "../types/filters";
import { FiltersPanel } from "./FiltersPanel";

interface Props {
	priceBounds: PriceBounds;
}

export function DesktopFiltersSidebar({ priceBounds }: Props) {
	return (
		<Card size="md" className="flex flex-col gap-6">
			<div className="flex items-center gap-2">
				<SlidersHorizontal
					size={16}
					className="text-[var(--text-muted)]"
					aria-hidden
				/>
				<h2 className="text-sm font-semibold text-[var(--text-primary)]">
					Фильтры
				</h2>
			</div>
			<FiltersPanel priceBounds={priceBounds} />
		</Card>
	);
}

export default DesktopFiltersSidebar;
