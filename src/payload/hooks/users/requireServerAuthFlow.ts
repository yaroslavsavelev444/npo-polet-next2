import type { CollectionBeforeLoginHook } from "payload";
import { AuthenticationError } from "payload";

/**
 * Флаг, которым серверный код помечает СВОЙ вызов payload.login().
 * Ставится только там, где выдача сессии действительно контролируется нашим
 * auth-flow (или где сессия вообще не выдаётся — см. ниже).
 */
export const AUTH_FLOW_CONTEXT = { viaServerAuthFlow: true } as const;

/**
 * beforeLogin-хук коллекции users: запрещает выдачу токена в обход нашего
 * auth-flow.
 *
 * Зачем. Второй фактор реализован в Server Action: loginAction прячет токен
 * на сервере до подтверждения OTP (см. modules/auth/actions/login.ts и
 * verifyOtp.ts). Но payload автоматически публикует для каждой auth-коллекции
 * REST-эндпоинт POST /api/users/login, который про наш flow ничего не знает и
 * отдаёт полноценный payload-token сразу после проверки пароля — то есть вся
 * 2FA обходилась одним запросом:
 *
 *   fetch('/api/users/login', {body: JSON.stringify({email, password})})
 *   → 200, cookie payload-token выставлена, /profile открыт без ввода кода
 *
 * Закрыть этот эндпоинт на уровне прокси нельзя: витрина и админка — одно и
 * то же приложение, а REST /api/users нужен админке для работы с
 * покупателями. Поэтому граница стоит там, где её не обойти никаким
 * транспортом — в самой операции login.
 *
 * Как работает. Local API умеет передавать context (см. Options в
 * node_modules/payload/dist/auth/operations/local/login.d.ts), а payload
 * прокидывает его в хуки. У REST-запроса своего context нет, поэтому проходит
 * только вызов, сделанный нашим серверным кодом, который явно об этом попросил.
 *
 * Почему бросаем именно AuthenticationError, а не понятный «403 Forbidden».
 * beforeLogin вызывается уже ПОСЛЕ сверки пароля (см. порядок в
 * node_modules/payload/dist/auth/operations/login.js), поэтому любой отличимый
 * от «неверный пароль» ответ превращает этот эндпоинт в оракул для проверки
 * украденных паролей: 403 = пара верна, 401 = нет. И, в отличие от формы
 * входа, у REST-эндпоинта нет нашего rate limit (см. RATE_LIMITS.login), то
 * есть проверять можно пачками. AuthenticationError(req.t) даёт ровно тот же
 * 401 с тем же текстом, что и настоящий неверный пароль, — эндпоинт становится
 * бесполезен для атакующего.
 *
 * Цена решения — DX: если серверный код забудет AUTH_FLOW_CONTEXT, вход
 * молча превратится в «Неверный email или пароль». Поэтому настоящая причина
 * пишется в лог сервера явно (ниже) — искать не придётся.
 */
export const requireServerAuthFlow: CollectionBeforeLoginHook = async ({
	context,
	req,
	user,
}) => {
	if (context?.viaServerAuthFlow === true) return;

	req.payload.logger.warn(
		{
			userId: user?.id,
			// Есть у REST-запроса и отсутствует у вызова через Local API —
			// помогает отличить попытку зайти мимо flow снаружи от нашего же
			// серверного вызова, забывшего передать AUTH_FLOW_CONTEXT.
			url: req.url,
		},
		"Вход в users в обход auth-flow отклонён (нет AUTH_FLOW_CONTEXT). " +
			"Если это наш серверный вызов payload.login() — ему нужен " +
			"AUTH_FLOW_CONTEXT из src/payload/hooks/users/requireServerAuthFlow.ts. " +
			"Если это прямой POST /api/users/login — так и задумано: сессия " +
			"покупателя выдаётся только после OTP (см. verifyOtp.ts).",
	);

	throw new AuthenticationError(req.t);
};
