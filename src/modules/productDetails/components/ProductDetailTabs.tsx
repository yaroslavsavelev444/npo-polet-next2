"use client";

import { useEffect, useState } from "react";
import { ReviewsSection, type ReviewsSectionData } from "@/modules/reviews";
import { Tabs } from "@/UI";
import {
	OPEN_REVIEWS_EVENT,
	PRODUCT_TABS_ANCHOR_ID,
} from "../lib/reviews-anchor";
import type { ProductDetailData } from "../types";
import { CharacteristicsTabContent } from "./tabs/CharacteristicsTabContent";

interface Props {
	product: ProductDetailData;
	reviewsData: ReviewsSectionData;
}

const CHARACTERISTICS_KEY = "characteristics";
const REVIEWS_KEY = "reviews";

/**
 * Контентные вкладки страницы товара. Сведены к двум осмысленным разделам —
 * «Характеристики» (включая габариты и инструкцию) и «Отзывы» — вместо трёх
 * пересекающихся. Управляемый режим нужен, чтобы клик по рейтингу в шапке
 * (событие OPEN_REVIEWS_EVENT) открывал вкладку отзывов.
 */
export function ProductDetailTabs({ product, reviewsData }: Props) {
	const [activeKey, setActiveKey] = useState(CHARACTERISTICS_KEY);

	useEffect(() => {
		const openReviews = () => setActiveKey(REVIEWS_KEY);
		window.addEventListener(OPEN_REVIEWS_EVENT, openReviews);
		return () => window.removeEventListener(OPEN_REVIEWS_EVENT, openReviews);
	}, []);

	const reviewsLabel =
		reviewsData.breakdown.count > 0
			? `Отзывы (${reviewsData.breakdown.count})`
			: "Отзывы";

	const items = [
		{
			key: CHARACTERISTICS_KEY,
			label: "Характеристики",
			content: <CharacteristicsTabContent product={product} />,
		},
		{
			key: REVIEWS_KEY,
			label: reviewsLabel,
			content: <ReviewsSection data={reviewsData} />,
		},
	];

	return (
		<div id={PRODUCT_TABS_ANCHOR_ID} className="scroll-mt-24">
			<Tabs items={items} activeKey={activeKey} onChange={setActiveKey} />
		</div>
	);
}
