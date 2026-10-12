import nodemailer, {
	type SendMailOptions,
	type SentMessageInfo,
	type Transporter,
} from "nodemailer";
import { getEmailConfig } from "./config.ts";
import { type FailoverState, sendWithFailover } from "./failover.ts";
import { emailLogger } from "./logger.ts";

let cachedTransporter: Transporter | null = null;
let cachedFallbackTransporter: Transporter | null = null;
const failoverState: FailoverState = { primaryDownUntil: 0 };

// Без таймаутов nodemailer ждёт недоступный сервер до двух минут на попытку, а
// код входа — это письмо: зависший SMTP держал бы открытым запрос логина, и
// переключение на запасной случилось бы слишком поздно.
const TIMEOUTS = {
	connectionTimeout: 10_000,
	greetingTimeout: 10_000,
	socketTimeout: 20_000,
} as const;

/**
 * Singleton-транспорт nodemailer. Пересоздаётся один раз на процесс, чтобы
 * переиспользовать пул TLS-соединений между письмами, а не открывать новое
 * соединение на каждую отправку.
 */
export function getEmailTransporter(): Transporter {
	if (cachedTransporter) return cachedTransporter;

	const config = getEmailConfig();
	cachedTransporter = nodemailer.createTransport({
		host: config.SMTP_HOST,
		port: config.SMTP_PORT,
		secure: config.smtpSecure,
		auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
		...TIMEOUTS,
	});

	return cachedTransporter;
}

/** Транспорт запасного SMTP или null, если он не настроен. */
function getFallbackEmailTransporter(): Transporter | null {
	const { fallback } = getEmailConfig();
	if (!fallback) return null;
	if (cachedFallbackTransporter) return cachedFallbackTransporter;

	cachedFallbackTransporter = nodemailer.createTransport({
		host: fallback.host,
		port: fallback.port,
		secure: fallback.secure,
		auth: { user: fallback.user, pass: fallback.password },
		...TIMEOUTS,
	});

	return cachedFallbackTransporter;
}

function formatSender(name: string, email: string): string {
	return `"${name.replace(/"/g, "")}" <${email}>`;
}

/**
 * Единственный способ отправить письмо по SMTP: через основной сервер, а если
 * он недоступен — через запасной (failover.ts). Отправитель подставляется
 * здесь, под каждый сервер свой; `from` у письма игнорируется.
 */
export function sendMailWithFailover(
	mail: Omit<SendMailOptions, "from">,
): Promise<SentMessageInfo> {
	const config = getEmailConfig();
	const fallback = getFallbackEmailTransporter();

	return sendWithFailover<SentMessageInfo>(
		mail,
		{
			primary: {
				name: "primary",
				mailer: getEmailTransporter(),
				from: formatSender(config.EMAIL_FROM_NAME, config.EMAIL_FROM_ADDRESS),
			},
			fallback:
				fallback && config.fallback
					? {
							name: "fallback",
							mailer: fallback,
							from: formatSender(
								config.EMAIL_FROM_NAME,
								config.fallback.fromAddress,
							),
						}
					: null,
		},
		failoverState,
		emailLogger,
	);
}

export function __resetEmailTransporterCacheForTests(): void {
	cachedTransporter = null;
	cachedFallbackTransporter = null;
	failoverState.primaryDownUntil = 0;
}
