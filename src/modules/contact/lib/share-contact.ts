export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * Отправляет ссылку на страницу контактов системным меню «Поделиться», а там,
 * где его нет, копирует адрес в буфер.
 *
 * Результат возвращается, а не проглатывается: вызывающий обязан показать
 * разное — «отправлено», «скопировано», ничего (отмена) или ошибку. Прежняя
 * версия сообщала «Ссылка скопирована» в том числе после отмены системного
 * диалога, то есть врала.
 *
 * Отмена определяется по имени ошибки AbortError — так её сообщает
 * спецификация Web Share, и отличить её от настоящего сбоя иначе нельзя.
 */
export async function shareContact(companyName: string): Promise<ShareResult> {
	const url = window.location.href;

	if (navigator.share) {
		try {
			await navigator.share({
				title: companyName,
				text: `Контакты — ${companyName}`,
				url,
			});
			return "shared";
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") {
				return "cancelled";
			}
			// Не вышло поделиться — пробуем скопировать, это тоже решение задачи.
		}
	}

	try {
		await navigator.clipboard.writeText(url);
		return "copied";
	} catch {
		return "failed";
	}
}
