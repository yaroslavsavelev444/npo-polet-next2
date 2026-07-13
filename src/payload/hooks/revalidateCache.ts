// src/payload/hooks/revalidateCache.ts
import { revalidateTag } from "next/cache.js";

// Payload REST-хуки (afterChange/afterDelete) выполняются в контексте
// Route Handler'а (/api/...), а не Server Action — поэтому здесь нельзя
// использовать updateTag (бросает исключение вне Server Action, см.
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md).
// revalidateTag(tag, "max") тоже не подходит: с профилем "max" тег лишь
// помечается устаревшим, а свежие данные подтягиваются в фоне при
// СЛЕДУЮЩЕМ визите на страницу с этим тегом — то есть посетитель сразу
// после сохранения в админке всё ещё увидит старые данные (иногда
// сколь угодно долго, если на страницу никто не заходит). { expire: 0 } —
// задокументированный способ получить немедленную инвалидацию именно из
// Route Handler/webhook-контекста (см. revalidateTag.md, раздел про вебхуки).
export const createRevalidateCacheHook =
	(...tags: string[]) =>
	() => {
		for (const tag of tags) {
			try {
				revalidateTag(tag, { expire: 0 });
			} catch (err) {
				// revalidateTag требует активный Next.js request store (Route
				// Handler/Server Action). Payload-хуки могут сработать и вне
				// такого контекста — например, из scripts/db-migrate/run.ts,
				// обычного standalone Node-процесса без единого HTTP-запроса.
				// В этом случае Next бросает
				// "Invariant: static generation store missing" — это не
				// повод ронять саму запись в БД (кэш просто останется как
				// есть до следующего реального изменения через приложение).
				// Любую ДРУГУЮ ошибку пробрасываем дальше — это уже
				// по-настоящему неожиданно.
				const message = err instanceof Error ? err.message : String(err);
				if (!message.includes("static generation store missing")) {
					throw err;
				}
			}
		}
	};
