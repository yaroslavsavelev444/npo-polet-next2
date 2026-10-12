/**
 * Разорвать сокеты покупателя в шлюзе — сразу, а не через минуту, когда
 * шлюз сам перепроверит сессию: выход, отзыв сессии, блокировка, запрет
 * писать в чат, удаление аккаунта.
 *
 * Разрываются все сокеты покупателя. Клиент переподключается сам
 * (useWidgetChat), и при рукопожатии шлюз проверяет cookie заново: живые
 * сессии возвращаются за секунду, отозванная получает отказ. Отдельной
 * комнаты на каждую сессию для этого не нужно.
 *
 * Эмиттер подгружается динамически: этот модуль зовут из кода, который
 * попадает и в граф proxy.ts, и в граф payload.config.ts (хуки users), —
 * тянуть туда ioredis и redis-emitter статически незачем.
 *
 * Никогда не бросает: разрыв чата — дополнение к основному действию.
 */
export async function kickUserSockets(userId: number | string): Promise<void> {
	try {
		const { disconnectUserSockets, getRedisBroadcaster } = await import(
			"./broadcast.ts"
		);
		disconnectUserSockets(getRedisBroadcaster(), Number(userId));
	} catch (error) {
		console.warn("[support-chat] сокеты покупателя не разорваны", {
			userId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
