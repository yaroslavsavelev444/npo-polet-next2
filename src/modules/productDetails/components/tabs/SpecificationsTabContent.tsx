import { Empty } from "@/UI";
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

export function SpecificationsTabContent({ specifications }: Props) {
  if (specifications.length === 0) {
    return <Empty message="Характеристики не указаны" />;
  }

  return (
    <div className="flex flex-col gap-6">
      {groupSpecifications(specifications).map(([groupName, items]) => (
        <div key={groupName}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {groupName}
          </h3>
          <dl className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
            {items.map((spec) => (
              <div
                key={spec.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
              >
                <dt className="text-sm text-[var(--text-secondary)]">
                  {spec.name}
                </dt>
                <dd className="text-sm font-medium text-[var(--text-primary)]">
                  {spec.value}
                  {spec.unit && (
                    <span className="ml-1 text-[var(--text-muted)]">
                      {spec.unit}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
