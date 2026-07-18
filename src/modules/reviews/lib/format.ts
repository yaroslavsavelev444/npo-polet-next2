const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
	day: "numeric",
	month: "long",
	year: "numeric",
});

/** Дата отзыва в виде «5 июля 2026». */
export function formatReviewDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return dateFormatter.format(date);
}

/** Склонение слова «отзыв» по количеству: 1 отзыв, 2 отзыва, 5 отзывов. */
export function pluralizeReviews(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "отзыв";
	if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100))
		return "отзыва";
	return "отзывов";
}
