"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BasePayload } from "payload";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notify } from "@/services/notifications/notificationCenter";
import { notifyPasswordReset } from "@/services/notifications/notifyPasswordReset";
import { completeLogin } from "../lib/completeLogin";
import {
	findMissingRequiredConsents,
	recordUserConsents,
} from "../lib/consents";
import {
	isAccountAccessDeniedError,
	isFieldTakenError,
	logUnexpectedAuthError,
} from "../lib/errorHandling";
import { getCurrentUser } from "../lib/getCurrentUser";
import { RATE_LIMITS } from "../lib/rateLimit";
import {
	actionError,
	actionSuccess,
	formValues,
	getRequestMeta,
} from "../lib/utils";
import {
	type AcceptedConsentInput,
	acceptedConsentSchema,
	nameSchema,
} from "../schemas/register.schema";
import { startConfirmationByCode } from "./confirmByCode";
import {
	consumePendingSignup,
	type PendingSignup,
	readPendingSignup,
} from "./flowStore";
import { linkIdentity, listIdentities, unlinkIdentity } from "./identities";
import { issueSessionWithoutPassword } from "./issueSession";

const PROVIDER_LABEL = "Яндекс ID";

const EXPIRED_MESSAGE =
	"Время на завершение регистрации истекло. Войдите через Яндекс ID ещё раз.";

/**
 * Завершение регистрации через Яндекс ID: форма «имя + согласия» на
 * /auth/yandex/complete. Почта — из черновика (Redis), не из формы: подменить
 * её на чужую нельзя.
 *
 * Порядок как у registerAction: проверки → создание пользователя → согласия.
 * Отличия:
 *  • пароль — случайный, никому не известный (hasPassword: false);
 *  • почта на домене Яндекса подтверждена сразу, иначе — наш код
 *    (email_verify), и привязка появится только после него;
 *  • занятая почта (другая вкладка успела зарегистрироваться) — не ошибка,
 *    а путь привязки с кодом, как в callback.
 */
export async function completeYandexSignupAction(
	_prevState: unknown,
	formData: FormData,
) {
	const echo = formValues(formData, ["name"]);

	if (!(await readPendingSignup())) return actionError(EXPIRED_MESSAGE);

	const name = nameSchema.safeParse(String(formData.get("name") ?? "").trim());
	if (!name.success) {
		return actionError(
			"Проверьте введённые данные",
			{ name: name.error.issues.map((i) => i.message) },
			"validation",
			echo,
		);
	}

	let accepted: AcceptedConsentInput[];
	try {
		const raw = JSON.parse(String(formData.get("consentsJson") ?? "[]"));
		accepted = (raw as unknown[]).map((c) => acceptedConsentSchema.parse(c));
	} catch {
		return actionError(
			"Некорректные данные согласий",
			undefined,
			"validation",
			echo,
		);
	}

	const { ip, userAgent } = await getRequestMeta();
	const rl = await RATE_LIMITS.register(ip);
	if (!rl.allowed) {
		return actionError(
			"Слишком много попыток регистрации. Попробуйте позже.",
			undefined,
			"rate_limited",
			echo,
		);
	}

	const payload = await getPayloadInstance();

	const missing = await findMissingRequiredConsents(payload, accepted);
	if (missing.length > 0) {
		return actionError(
			"Необходимо принять все обязательные соглашения",
			{ consents: [`Не приняты: ${missing.join(", ")}`] },
			"validation",
			echo,
		);
	}

	// С этого места черновик одноразовый: вторая параллельная отправка формы
	// его уже не найдёт и второй аккаунт не заведёт.
	const signup = await consumePendingSignup();
	if (!signup) return actionError(EXPIRED_MESSAGE);

	let target: string;
	try {
		target = await createAccountFromSignup(payload, {
			signup,
			name: name.data,
			accepted,
			ip,
			userAgent,
		});
	} catch (err) {
		if (isAccountAccessDeniedError(err)) {
			return actionError(
				"Вход в этот аккаунт ограничен. Обратитесь в поддержку.",
				undefined,
				"account_blocked",
			);
		}
		logUnexpectedAuthError("oauth.completeSignup", err);
		return actionError(
			"Не удалось завершить регистрацию. Войдите через Яндекс ID ещё раз.",
			undefined,
			"server_error",
			echo,
		);
	}

	// redirect() бросает NEXT_REDIRECT — поэтому вне try/catch.
	redirect(target);
}

/** @returns куда отправить покупателя дальше. */
async function createAccountFromSignup(
	payload: BasePayload,
	params: {
		signup: PendingSignup;
		name: string;
		accepted: AcceptedConsentInput[];
		ip: string;
		userAgent: string;
	},
): Promise<string> {
	const { signup, ip, userAgent } = params;
	const oauthLink = {
		provider: signup.provider,
		subject: signup.subject,
		email: signup.email,
	};

	let userId: number;
	try {
		const user = await payload.create({
			collection: "users",
			data: {
				email: signup.email,
				// Никому не известный пароль: Payload требует его при создании.
				// Войти им нельзя; свой пароль покупатель задаст восстановлением.
				password: randomBytes(32).toString("base64url"),
				name: params.name,
				role: "user",
				status: "active",
				twoFAVerified: false,
				emailVerified: signup.emailTrusted,
				hasPassword: false,
			},
			overrideAccess: true,
		});
		userId = Number(user.id);
	} catch (err) {
		if (!isFieldTakenError(err, "email")) throw err;
		// Почту успели занять между возвратом с Яндекса и отправкой формы —
		// значит, аккаунт уже не наш: только через код на эту почту.
		const { docs } = await payload.find({
			collection: "users",
			where: { email: { equals: signup.email } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		if (!docs[0]) throw err;
		const started = await startConfirmationByCode(payload, {
			userId: docs[0].id,
			type: "link_oauth",
			oauthLink,
			redirectTo: signup.next,
			ip,
			userAgent,
		});
		if (!started)
			throw new Error("oauth.signup: не удалось создать код привязки");
		return "/auth/verify-otp";
	}

	void notify(payload, userId, "welcome", {});
	await recordUserConsents(payload, {
		userId,
		accepted: params.accepted,
		ip,
		userAgent,
	});

	if (!signup.emailTrusted) {
		const started = await startConfirmationByCode(payload, {
			userId,
			type: "email_verify",
			oauthLink,
			redirectTo: signup.next,
			ip,
			userAgent,
		});
		if (!started)
			throw new Error("oauth.signup: не удалось создать код подтверждения");
		return "/auth/verify-otp";
	}

	await linkIdentity(payload, { userId, ...oauthLink });
	const { token } = await issueSessionWithoutPassword(payload, userId);
	await completeLogin({
		payload,
		userId: String(userId),
		token,
		ip,
		userAgent,
	});
	revalidatePath("/", "layout");
	return signup.next;
}

/**
 * Отвязка Яндекс ID в кабинете. Последний способ входа отвязать нельзя: у
 * аккаунта без своего пароля после этого не осталось бы ни одного входа.
 */
export async function unlinkOAuthIdentityAction(identityId: number) {
	const user = await getCurrentUser();
	if (!user) return actionError("Войдите, чтобы продолжить.");

	const payload = await getPayloadInstance();
	const identities = await listIdentities(payload, user.id);
	if (!identities.some((i) => i.id === identityId)) {
		return actionError("Привязка не найдена. Обновите страницу.");
	}
	if (user.hasPassword === false && identities.length <= 1) {
		return actionError(
			"Это единственный способ входа в аккаунт. Сначала задайте пароль — тогда Яндекс ID можно будет отвязать.",
		);
	}

	const removed = await unlinkIdentity(payload, user.id, identityId);
	if (removed) {
		void notify(payload, user.id, "oauth_unlinked", {
			providerLabel: PROVIDER_LABEL,
		});
	}
	revalidatePath("/profile");
	return actionSuccess({ removed });
}

/**
 * «Задать пароль» для аккаунта без пароля (заведён через Яндекс ID): то же
 * письмо со ссылкой, что и «Забыли пароль?», но на почту ТЕКУЩЕГО аккаунта —
 * адрес не вводится и подменить его нельзя. После установки пароля
 * resetPasswordAction ставит hasPassword: true и завершает все сессии.
 */
export async function sendSetPasswordLinkAction() {
	const user = await getCurrentUser();
	if (!user) return actionError("Войдите, чтобы продолжить.");

	const { ip } = await getRequestMeta();
	const rl = await RATE_LIMITS.forgotPassword(ip);
	if (!rl.allowed) {
		return actionError(
			"Слишком много запросов. Попробуйте позже.",
			undefined,
			"rate_limited",
		);
	}

	const payload = await getPayloadInstance();
	const token = await payload.forgotPassword({
		collection: "users",
		data: { email: user.email },
		disableEmail: true,
	});
	if (token) await notifyPasswordReset({ email: user.email, token });
	return actionSuccess({ email: user.email });
}
