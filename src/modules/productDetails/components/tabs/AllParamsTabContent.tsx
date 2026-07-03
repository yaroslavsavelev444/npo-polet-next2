import { formatPrice, getProductStatusLabel } from "@/modules/productCard";
import { Empty } from "@/UI";
import type { ProductDetailData } from "../../types";

interface ParamRow {
  label: string;
  value: string;
}

interface Props {
  product: ProductDetailData;
}

export function AllParamsTabContent({ product }: Props) {
  const { dimensions, brand } = product;
  const hasDimensions =
    dimensions.length !== null ||
    dimensions.width !== null ||
    dimensions.height !== null ||
    dimensions.weight !== null;

  const sections: { title: string; rows: ParamRow[] }[] = [
    {
      title: "Основная информация",
      rows: [
        {
          label: "Категория",
          value: product.category?.title ?? "Без категории",
        },
        { label: "Производитель", value: brand.manufacturer ?? "Не указан" },
        {
          label: "Гарантия",
          value: brand.warrantyMonths
            ? `${brand.warrantyMonths} мес.`
            : "Не предоставляется",
        },
      ],
    },
  ];

  if (hasDimensions) {
    sections.push({
      title: "Габариты и вес",
      rows: [
        {
          label: "Длина",
          value: dimensions.length ? `${dimensions.length} см` : "—",
        },
        {
          label: "Ширина",
          value: dimensions.width ? `${dimensions.width} см` : "—",
        },
        {
          label: "Высота",
          value: dimensions.height ? `${dimensions.height} см` : "—",
        },
        {
          label: "Вес",
          value: dimensions.weight ? `${dimensions.weight} кг` : "—",
        },
      ],
    });
  }

  sections.push(
    {
      title: "Наличие и заказ",
      rows: [
        { label: "Статус", value: getProductStatusLabel(product.status) },
        {
          label: "Минимальное количество",
          value: `${product.minOrderQuantity} шт.`,
        },
        {
          label: "Максимальное количество",
          value: `${product.maxOrderQuantity} шт.`,
        },
      ],
    },
    {
      title: "Цена",
      rows: [
        { label: "Цена", value: formatPrice(product.priceForIndividual) },
        ...(product.hasDiscount
          ? [
              {
                label: "Цена со скидкой",
                value: formatPrice(product.finalPrice),
              },
              {
                label: "Размер скидки",
                value: `${product.discountPercentage}%`,
              },
            ]
          : []),
      ],
    },
  );

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <div key={section.title}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {section.title}
          </h3>
          <dl className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
            {section.rows.map((row) => (
              <div
                key={row.label}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
              >
                <dt className="text-sm text-[var(--text-secondary)]">
                  {row.label}
                </dt>
                <dd className="text-sm font-medium text-[var(--text-primary)]">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
