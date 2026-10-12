import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/modules/auth/lib/rateLimit";
import { SupportError } from "@/modules/support-chat/server/errors";
import {
	errorResponse,
	json,
	requireActor,
} from "@/modules/support-chat/server/http";
import { searchSite } from "@/payload/services/search.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface KnowledgeHintDTO {
	type: "knowledge" | "faq";
	title: string;
	href: string;
	snippet: string | null;
}

/**
 * GET /api/support/knowledge?q=… — до трёх статей базы знаний и вопросов FAQ.
 *
 * Менеджеру — «отправить ссылку на статью» прямо из консоли; покупателю —
 * «Возможно, ответ уже есть», пока он ждёт. Поиск тот же, что в шапке
 * сайта (search.service), только без товаров.
 *
 * Запрос — то, что человек сам ввёл или выделил для поиска, а не переписка
 * целиком: как и любой поиск по сайту, он уходит в Postgres параметром
 * полнотекстового запроса и нигде не хранится.
 */
export async function GET(request: NextRequest) {
	try {
		const actor = await requireActor(request);
		const q = (request.nextUrl.searchParams.get("q") ?? "")
			.trim()
			.slice(0, 200);
		if (q.length < 2) return json({ hints: [] });

		const key = `support:kb:${actor.kind}:${actor.kind === "customer" ? actor.userId : actor.adminId}`;
		if (!(await checkRateLimit(key, 30, 60_000)).allowed) {
			throw new SupportError(
				"rate_limited",
				"Слишком часто — подождите немного",
			);
		}

		const { sections } = await searchSite(q);
		const hints: KnowledgeHintDTO[] = [];
		for (const section of sections) {
			if (section.type === "knowledge") {
				for (const item of section.items) {
					hints.push({
						type: "knowledge",
						title: item.title,
						href: item.href,
						snippet: item.snippet,
					});
				}
			} else if (section.type === "faq") {
				for (const item of section.items) {
					hints.push({
						type: "faq",
						title: item.question,
						href: item.href,
						snippet: item.snippet,
					});
				}
			}
		}
		return json({ hints: hints.slice(0, 3) });
	} catch (error) {
		return errorResponse(error, "/api/support/knowledge");
	}
}
