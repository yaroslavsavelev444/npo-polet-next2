import { headers } from "next/headers";
import { getPayloadInstance } from "@/payload/services/getPayload";
import type { User } from "@/payload-types";
import { isUser } from "./typeGuards";

/**
 * Единственная точка «кто выполняет этот запрос» для витрины.
 *
 * Помимо валидности токена проверяет СТАТУС аккаунта. Раньше статус
 * учитывался только при входе (beforeLogin) и в proxy.ts на защищённых
 * путях — то есть заблокированный или приостановленный администратором
 * пользователь продолжал пользоваться уже выданным токеном во всех Server
 * Actions и Route Handlers (корзина, оформление заказа, отзывы, уведомления)
 * до самого истечения JWT. Блокировка обязана действовать сразу и на всех
 * транспортах, поэтому проверка живёт здесь, а не в каждом вызове.
 *
 * Возвращает только покупателя (коллекция `users`): аккаунт персонала
 * (`admins`) не является клиентом витрины, и подставлять его id в
 * пользовательские коллекции нельзя — id разных коллекций пересекаются.
 */
export async function getAuthenticatedUserFromHeaders(
	requestHeaders: Headers,
): Promise<User | null> {
	const payload = await getPayloadInstance();

	let user: Awaited<ReturnType<typeof payload.auth>>["user"];
	try {
		const auth = await payload.auth({ headers: requestHeaders });
		user = auth.user;
	} catch {
		return null;
	}

	if (!user || !isUser(user)) return null;
	if (user.status === "blocked" || user.status === "suspended") return null;

	return user;
}

export async function getCurrentUser() {
	return getAuthenticatedUserFromHeaders(await headers());
}
