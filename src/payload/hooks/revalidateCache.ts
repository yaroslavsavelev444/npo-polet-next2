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
			revalidateTag(tag, { expire: 0 });
		}
	};
