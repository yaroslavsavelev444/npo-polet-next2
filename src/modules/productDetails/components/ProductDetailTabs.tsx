import { Tabs } from "@/UI";
import type { ProductDetailData } from "../types";
import { AllParamsTabContent } from "./tabs/AllParamsTabContent";
import { InstructionCard } from "./tabs/InstructionCard";
import { ReviewsTabContent } from "./tabs/ReviewsTabContent";
import { SpecificationsTabContent } from "./tabs/SpecificationsTabContent";

interface Props {
  product: ProductDetailData;
}

export function ProductDetailTabs({ product }: Props) {
  const items = [
    {
      key: "specifications",
      label: "Характеристики",
      content: (
        <div className="flex flex-col gap-6">
          <SpecificationsTabContent specifications={product.specifications} />
          {product.instruction && (
            <InstructionCard instruction={product.instruction} />
          )}
        </div>
      ),
    },
    {
      key: "reviews",
      label: "Отзывы",
      content: <ReviewsTabContent />,
    },
    {
      key: "all-params",
      label: "Все параметры",
      content: <AllParamsTabContent product={product} />,
    },
  ];

  return <Tabs items={items} defaultActiveKey="specifications" />;
}
