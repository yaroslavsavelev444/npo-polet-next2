import type { SendMailOptions } from "nodemailer";

/**
 * Переключение между основным SMTP и запасным.
 *
 * ─── Зачем ──────────────────────────────────────────────────────────────────
 *
 * В октябре 2026 Яндекс начал отбивать TCP-соединения с IP боевого сервера на
 * всех SMTP-портах (465, 587, 25), хотя из любой другой сети принимал их, а сам
 * сервер спокойно доходил до Gmail. В коде ошибки не было, но перестали уходить
 * коды входа, заказы и письма менеджерам. Запасной SMTP превращает такой сбой
 * в строку в журнале.
 *
 * ─── Чего он НЕ делает ──────────────────────────────────────────────────────
 *
 * Не переотправляет письмо, которое основной сервер ОТКЛОНИЛ. Отказ по адресу
 * (550 «нет такого ящика»), письмо, признанное спамом: запасной либо откажет так
 * же, либо доставит то, что основной сознательно не доставил. А если основной
 * успел принять письмо до ошибки, получится дубль. Поэтому на запасной уходят
 * только сбои вида «сервер недоступен или не хочет с нами разговаривать».
 *
 * Модуль не знает ни о nodemailer-транспортах, ни о часах: маршруты собирает
 * transport.ts, а здесь только решение, куда слать. Так его можно проверить без
 * сети (tests/email/failover.test.ts).
 */

/** Сколько основной SMTP пропускается после того, как к нему не удалось подключиться. */
export const PRIMARY_COOLDOWN_MS = 60_000;

/**
 * Коды ошибок nodemailer, описывающие соединение, а не письмо: сокет не открылся
 * или оборвался (ECONNECTION, ESOCKET, ETIMEDOUT), не разрешилось имя (EDNS), не
 * договорились о TLS (ETLS), сервер говорит не по SMTP (EPROTOCOL) или не принял
 * логин (EAUTH: отозванный пароль приложения для сервера так же фатален, как
 * закрытый порт).
 */
const CONNECTION_ERROR_CODES = new Set([
	"ECONNECTION",
	"ESOCKET",
	"ETIMEDOUT",
	"EDNS",
	"ETLS",
	"EPROTOCOL",
	"EAUTH",
]);

/** true, если отказал сам SMTP-сервер, и другой сервер вполне может справиться. */
export function isRelayFailure(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const { code, command, responseCode } = error as {
		code?: unknown;
		command?: unknown;
		responseCode?: unknown;
	};

	if (typeof code === "string" && CONNECTION_ERROR_CODES.has(code)) return true;
	// Всё, что сломалось ещё на подключении, включая приветствие вида
	// «554 5.7.1 Your IP is blocked», касается нас, а не письма.
	if (command === "CONN") return true;
	// 421: «service not available, closing transmission channel».
	return responseCode === 421;
}

interface Mailer<TInfo> {
	sendMail(mail: SendMailOptions): Promise<TInfo>;
}

export interface SmtpRoute<TInfo> {
	name: "primary" | "fallback";
	mailer: Mailer<TInfo>;
	/** Отправитель для этого сервера: чужой адрес в From серверы не пропускают. */
	from: string;
}

export interface FailoverState {
	primaryDownUntil: number;
}

interface FailoverLog {
	warn(message: string, context?: Record<string, unknown>): void;
	info(message: string, context?: Record<string, unknown>): void;
}

/**
 * Отправляет письмо через основной SMTP, а если он недоступен, то через
 * запасной. `mail.from` игнорируется: каждый маршрут шлёт от своего адреса.
 *
 * Письму через запасной сервер ставится Reply-To на основной адрес (если у
 * письма нет своего), чтобы ответ клиента пришёл в привычный ящик, а не в
 * запасной, который никто не читает.
 */
export async function sendWithFailover<TInfo>(
	mail: Omit<SendMailOptions, "from">,
	routes: { primary: SmtpRoute<TInfo>; fallback: SmtpRoute<TInfo> | null },
	state: FailoverState,
	log: FailoverLog,
	now: () => number = Date.now,
): Promise<TInfo> {
	const { primary, fallback } = routes;

	if (!fallback) {
		return primary.mailer.sendMail({ ...mail, from: primary.from });
	}

	// Пока основной «остывает», его всё равно пробуем, только вторым: если
	// упадёт и запасной, без SMTP мы не останемся.
	const order =
		now() < state.primaryDownUntil ? [fallback, primary] : [primary, fallback];

	let lastError: unknown;
	for (const [index, route] of order.entries()) {
		try {
			const info = await route.mailer.sendMail({
				...mail,
				from: route.from,
				...(route.name === "fallback"
					? { replyTo: mail.replyTo ?? primary.from }
					: {}),
			});

			if (route.name === "primary" && state.primaryDownUntil !== 0) {
				state.primaryDownUntil = 0;
				log.info("Основной SMTP снова доступен");
			}
			return info;
		} catch (error) {
			if (!isRelayFailure(error)) throw error;
			lastError = error;

			if (route.name === "primary") {
				state.primaryDownUntil = now() + PRIMARY_COOLDOWN_MS;
			}
			if (index < order.length - 1) {
				log.warn(`SMTP "${route.name}" недоступен — пробуем другой`, {
					relay: route.name,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	throw lastError;
}
