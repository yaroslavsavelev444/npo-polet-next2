import type { AgentStatus, SupportTopic } from "../lib/constants.ts";

/**
 * Кому отдать новый диалог. Чистая функция: состояние менеджеров собирает
 * вызывающий (presence.ts + счётчики из базы).
 *
 * Лимита одновременных диалогов нет (решение владельца, 11.10.2026): в пик
 * диалоги делятся между всеми, кто на месте, а не копятся в очереди.
 *
 * Правила по порядку:
 *  1. Только «на месте».
 *  2. Если у кого-то из них в темах есть тема диалога — выбираем из них.
 *     Иначе — из тех, у кого темы не заданы (берут любые). Менеджер, у
 *     которого темы заданы и этой среди них нет, получает диалог, только
 *     когда больше некому.
 *  3. Меньше открытых диалогов.
 *  4. При равенстве — тот, кому дольше всех ничего не доставалось.
 *     Без этого при равной нагрузке все диалоги уходили бы менеджеру с
 *     меньшим id.
 */

export interface AgentCandidate {
	adminId: number;
	status: AgentStatus;
	openCount: number;
	topics: SupportTopic[];
	/** Время последнего назначения, мс; null — не назначалось никогда. */
	lastAssignedAt: number | null;
}

export function pickAgent(
	candidates: readonly AgentCandidate[],
	topic: SupportTopic,
): number | null {
	const eligible = candidates.filter((agent) => agent.status === "available");
	if (eligible.length === 0) return null;

	const specialists = eligible.filter((agent) => agent.topics.includes(topic));
	const generalists = eligible.filter((agent) => agent.topics.length === 0);
	const pool =
		specialists.length > 0
			? specialists
			: generalists.length > 0
				? generalists
				: eligible;

	const sorted = [...pool].sort((a, b) => {
		if (a.openCount !== b.openCount) return a.openCount - b.openCount;
		const idleA = a.lastAssignedAt ?? Number.NEGATIVE_INFINITY;
		const idleB = b.lastAssignedAt ?? Number.NEGATIVE_INFINITY;
		if (idleA !== idleB) return idleA - idleB;
		return a.adminId - b.adminId;
	});
	return sorted[0].adminId;
}
