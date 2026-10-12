import type { NextRequest } from "next/server";
import {
	errorResponse,
	json,
	resolveActor,
	supportDeps,
} from "@/modules/support-chat/server/http";
import {
	getSupportConfig,
	isChatOpenForUser,
} from "@/modules/support-chat/server/settings";
import { customerUnreadCount } from "@/modules/support-chat/server/support.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type WidgetState =
	| { state: "guest" }
	| { state: "disabled" }
	| { state: "banned" }
	| { state: "ready"; unread: number };

/**
 * GET /api/support/widget — что показать на кнопке чата: войти, чат
 * недоступен или готов (с числом непрочитанных ответов). Опрашивается
 * кнопкой раз в минуту, пока чат закрыт, — без сокета на каждой странице.
 *
 * Менеджер на витрине — как гость: писать в поддержку самому себе незачем.
 * «disabled» — кнопки чата на странице нет вовсе (чат ещё не запущен или
 * покупатель не в пилотной группе).
 */
export async function GET(request: NextRequest) {
	try {
		const actor = await resolveActor(request);
		const deps = await supportDeps();
		const config = await getSupportConfig(deps.payload);
		// Пока чат не запущен для всех, гость его не видит вовсе: зазывать
		// войти ради «скоро заработает» незачем.
		if (actor?.kind !== "customer") {
			return json<WidgetState>({
				state: config.enabled ? "guest" : "disabled",
			});
		}
		if (actor.chatBanned) return json<WidgetState>({ state: "banned" });
		if (!isChatOpenForUser(config, actor.userId)) {
			return json<WidgetState>({ state: "disabled" });
		}
		return json<WidgetState>({
			state: "ready",
			unread: await customerUnreadCount(deps, actor),
		});
	} catch (error) {
		return errorResponse(error, "/api/support/widget");
	}
}
