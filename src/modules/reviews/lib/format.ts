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

/** Короткая дата отзыва — «5 июл 2026». Для служебных подписей. */
const shortDateFormatter = new Intl.DateTimeFormat("ru-RU", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

export function formatReviewShortDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return shortDateFormatter.format(date);
}

/**
 * Инициалы автора для кружка рядом с именем.
 *
 * Публичное имя приходит уже сокращённым («Иван П.», см. formatAuthorName в
 * reviews.service) — берём первые буквы обеих частей.
 */
export function reviewInitials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const letters = parts.slice(0, 2).map((part) => part[0]);
	return letters.join("").toUpperCase() || "?";
}

/** Склонение слова «оценка»: 1 оценка, 2 оценки, 5 оценок. */
export function pluralizeRatings(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "оценка";
	if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100))
		return "оценки";
	return "оценок";
}

/**
 * Длина комментария, после которой он сворачивается до шести строк.
 *
 * Порог по знакам, а не по измеренной высоте: измерять текст в браузере ради
 * решения «показывать кнопку или нет» значит делать это после гидратации — и
 * кнопка появлялась бы рывком уже после того, как страницу начали читать.
 * 420 знаков — примерно шесть строк в колонке публичной сетки; ошибка в одну
 * строку здесь безобидна, а в SSR всё сходится с первого кадра.
 */
export const REVIEW_CLAMP_CHARS = 420;

export function isLongComment(comment: string): boolean {
	return comment.length > REVIEW_CLAMP_CHARS;
}
