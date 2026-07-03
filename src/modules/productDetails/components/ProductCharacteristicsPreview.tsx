import { Card } from "@/UI";
import type { ProductSpecificationItem } from "../types";

const PREVIEW_LIMIT = 6;

interface Props {
  specifications: ProductSpecificationItem[];
}

export function ProductCharacteristicsPreview({ specifications }: Props) {
  if (specifications.length === 0) return null;

  const previewItems = specifications.slice(0, PREVIEW_LIMIT);

  return (
    <Card variant="outlined" size="md">
      <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
        Основные характеристики
      </h2>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        {previewItems.map((spec) => (
          <div
            key={spec.id}
            className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] pb-2 last:border-0"
          >
            <dt className="text-sm text-[var(--text-secondary)]">
              {spec.name}
            </dt>
            <dd className="text-right text-sm font-medium text-[var(--text-primary)]">
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
    </Card>
  );
}
