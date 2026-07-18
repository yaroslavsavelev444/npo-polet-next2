import { cn } from "@/utils/cn";
import type { ProductSpecificationItem } from "../../types";

const DEFAULT_GROUP = "Общие характеристики";

function groupSpecifications(specifications: ProductSpecificationItem[]) {
	const groups = new Map<string, ProductSpecificationItem[]>();
	for (const spec of specifications) {
		const groupName = spec.group?.trim() || DEFAULT_GROUP;
		const groupItems = groups.get(groupName) ?? [];
		groupItems.push(spec);
		groups.set(groupName, groupItems);
	}
	return Array.from(groups.entries());
}

interface Props {
	specifications: ProductSpecificationItem[];
}

/**
 * Характеристики в формате «характеристика — значение». Раскладка в две
 * колонки на широком экране, поэтому строки короткие и читаемые, а не
 * растянуты во всю ширину. Чётные строки подсвечены для удобства сканирования.
 */
export function SpecificationsTabContent({ specifications }: Props) {
	if (specifications.length === 0) return null;

	return (
		<div className="flex flex-col gap-8">
			{groupSpecifications(specifications).map(([groupName, items]) => (
				<div key={groupName}>
					<h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
						{groupName}
					</h3>
					<dl className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
						{items.map((spec, index) => (
							<SpecRow
								key={spec.id}
								name={spec.name}
								value={spec.value}
								unit={spec.unit}
								striped={index % 2 === 0}
							/>
						))}
					</dl>
				</div>
			))}
		</div>
	);
}

export function SpecRow({
	name,
	value,
	unit,
	striped,
}: {
	name: string;
	value: string;
	unit?: string | null;
	striped?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex items-baseline justify-between gap-4 rounded-[var(--radius-sm)] px-3 py-2.5",
				striped && "bg-[var(--surface-secondary)]/50",
			)}
		>
			<dt className="text-sm text-[var(--text-secondary)]">{name}</dt>
			<dd className="text-right text-sm font-medium text-[var(--text-primary)]">
				{value}
				{unit && <span className="ml-1 text-[var(--text-muted)]">{unit}</span>}
			</dd>
		</div>
	);
}
