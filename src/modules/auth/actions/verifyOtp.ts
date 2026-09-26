"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notify } from "@/services/notifications/notificationCenter";
import { notifyNewSessionLogin } from "@/services/notifications/notifyNewSessionLogin";
import { completeLogin } from "../lib/completeLogin";
import { logUnexpectedAuthError } from "../lib/errorHandling";
import { verifyOtpCode } from "../lib/OtpStore";
import { clearPendingAuth, readPendingAuth } from "../lib/pendingAuth";
import { RATE_LIMITS } from "../lib/rateLimit";
import { parseDeviceLabel } from "../lib/session";
import { issueTrustedDevice } from "../lib/trustedDevice";
import { actionError, actionSuccess, getRequestMeta } from "../lib/utils";
import type { AuthErrorCode, OtpVerifyResult } from "../types";

/** Куда попадает пользователь сразу после завершения входа на своей странице. */
const REDIRECT_AFTER_LOGIN = "/profile";

const verifyOtpSchema = z.object({
	code: z
		.string()
		.length(6, "Код должен содержать 6 цифр")
		.regex(/^\d{6}$/, "Код должен содержать только цифры"),
	type: z.enum(["login_2fa", "email_verify"]),
	/**
	 * Откуда пришла форма.
	 *
	 * `page`    — отдельная страница входа/регистрации: по завершении нужен
	 *             серверный redirect, потому что после него приезжает свежее
	 *             RSC-дерево уже с выставленными cookie (разбор ниже).
	 * `overlay` — форма открыта поверх корзины или оформления. Уводить оттуда
	 *             нельзя: смысл оверлея ровно в том, чтобы человек остался на
	 *             месте. Действие возвращает успех, навигацию решает клиент.
	 *
	 * Поле необязательное и по умолчанию `page`: так поведение существующих
	 * страниц не меняется от самого факта появления второго режима.
	 */
	flow: z.enum(["page", "overlay"]).optional().default("page"),
});

/**
 * Server Action: верификация OTP-кода — точка, где вход становится
 * завершённым, если устройство ещё не доверенное.
 *
 * Единый action для двух сценариев:
 * - email_verify (регистрация)
 * - login_2fa (вход)
 *
 * В обоих случаях пользователь приходит сюда НЕ авторизованным: пароль уже
 * проверен, но payload-token ему ещё не выдавался (см. login.ts/register.ts).
 * Поэтому идентифицируем его по pending-auth челленджу, а не через
 * payload.auth() — авторизовывать пока нечего.
 *
 * Только после успешной проверки кода: выдаём payload-token, создаём Session,
 * ставим session-id (всё это — completeLogin) и ЗАПОМИНАЕМ УСТРОЙСТВО, чтобы
 * следующий вход с него обошёлся без кода (см. lib/trustedDevice.ts).
 */
export async function verifyOtpAction(_prevState: unknown, formData: FormData) {
	const parsed = verifyOtpSchema.safeParse({
		code: formData.get("code"),
		type: formData.get("type"),
		flow: formData.get("flow") ?? undefined,
	});

	if (!parsed.success) {
		return actionError("Некорректный код", parsed.error.flatten().fieldErrors);
	}

	const { code, type, flow } = parsed.data;

	// Перебор кода ограничен не только счётчиком попыток самого OTP: без
	// лимита по IP атакующий проходил бы цепочку «новый код → 5 попыток →
	// новый код» столько раз, сколько нужно.
	const { ip } = await getRequestMeta();
	const rl = await RATE_LIMITS.otpVerify(ip);
	if (!rl.allowed) {
		return actionError(
			"Слишком много попыток. Попробуйте позже.",
			undefined,
			"rate_limited",
		);
	}

	// ── Незавершённый вход ────────────────────────────────────────────────────
	const pending = await readPendingAuth();
	if (!pending) {
		return actionError("Сессия подтверждения истекла. Войдите снова.");
	}
	// type приходит из формы — сверяем с тем, ради чего челлендж создавался,
	// иначе кодом одного назначения можно было бы закрыть другое.
	if (pending.type !== type) {
		return actionError("Сессия подтверждения истекла. Войдите снова.");
	}

	// Челлендж-обманка (регистрация на уже существующий email — см.
	// registerAction): OTP для него не создавался. Отвечаем ровно как на
	// ненайденный код, чтобы регистрация оставалась неотличимой от повтора.
	if (pending.decoy) {
		return actionError("Код не найден. Запросите новый.");
	}

	const payload = await getPayloadInstance();

	// ── Верифицируем OTP ──────────────────────────────────────────────────────
	const result = await verifyOtpCode(payload, {
		userId: pending.userId,
		type,
		code,
	});

	if (!result.ok) {
		const messages: Record<typeof result.reason, string> = {
			not_found: "Код не найден. Запросите новый.",
			expired: "Код истёк. Запросите новый.",
			used: "Код уже использован. Запросите новый.",
			max_attempts: "Превышено количество попыток. Запросите новый код.",
			invalid: "Неверный код. Попробуйте ещё раз.",
		};
		// Только max_attempts получает отдельный code — UI показывает его как
		// предупреждение (жёлтый), а не как обычную ошибку неверного ввода.
		const codes: Partial<Record<typeof result.reason, AuthErrorCode>> = {
			max_attempts: "rate_limited",
		};
		// Челлендж намеренно НЕ трогаем: он нужен кнопке «отправить код
		// повторно» (resendOtpAction), в том числе после исчерпания попыток.
		// Прав он всё равно не даёт — единственное, что он открывает, это
		// экран ввода кода.
		return actionError(
			messages[result.reason],
			undefined,
			codes[result.reason],
		);
	}

	// ── Код верный: с этого момента вход считается состоявшимся ──────────────
	//
	// ip/userAgent берём из челленджа — это данные того же запроса, которым
	// вводили пароль.
	const { sessionId } = await completeLogin({
		payload,
		userId: pending.userId,
		token: pending.token,
		ip: pending.ip,
		userAgent: pending.userAgent,
		twoFactorPassed: true,
		markEmailVerified: type === "email_verify",
	});

	await clearPendingAuth();

	// ── Запоминаем устройство ────────────────────────────────────────────────
	//
	// Основание доверять этому браузеру появилось ровно сейчас: с него только
	// что подтвердили владение почтой. Выдаём доверие и для регистрации тоже —
	// подтверждение почты при регистрации ничем не слабее подтверждения при
	// входе, а человек, который завёл аккаунт ради одной покупки, не должен
	// на следующем же шаге доставать код заново.
	//
	// Роль читаем из базы, а не из челленджа: между вводом пароля и вводом
	// кода администратор мог изменить её, и решение о доверии обязано
	// опираться на текущее состояние. Сбой не отменяет вход — доверие это
	// удобство следующего раза.
	let deviceRemembered = false;
	try {
		const user = await payload.findByID({
			collection: "users",
			id: Number(pending.userId),
			depth: 0,
			overrideAccess: true,
		});

		const outcome = await issueTrustedDevice({
			payload,
			userId: pending.userId,
			sessionId,
			role: (user as { role?: string | null })?.role ?? null,
			ip: pending.ip,
			userAgent: pending.userAgent,
		});
		deviceRemembered = outcome.issued && outcome.isNew;
	} catch (err) {
		logUnexpectedAuthError("verifyOtp.issueTrustedDevice", err);
	}

	// ── Уведомление о входе ─────────────────────────────────────────────────
	// Раньше уходило из loginAction сразу после проверки пароля — то есть
	// одновременно с письмом с OTP-кодом, хотя фактический вход завершается
	// только здесь. Отправляем только для login_2fa: email_verify — это
	// подтверждение регистрации, не вход.
	//
	// С появлением доверенных устройств это письмо стало точнее, а не реже:
	// сюда попадают ровно те входы, которым потребовался код, — то есть
	// незнакомый браузер или другая сеть. Именно о них и стоит писать, и
	// именно поэтому в письме теперь сказано, что устройство запомнено и как
	// это отменить (см. notifyNewSessionLogin).
	const deviceLabel = parseDeviceLabel(pending.userAgent);

	if (type === "login_2fa") {
		void notifyNewSessionLogin({
			email: pending.email,
			userName: pending.name,
			deviceLabel,
			ip: pending.ip,
			deviceRemembered,
		});
	}

	void notify(
		payload,
		pending.userId,
		deviceRemembered ? "device_trusted" : "login_new_device",
		{ deviceLabel, ip: pending.ip },
	);

	// Вход только что изменил то, что рендерит корневой layout (Navbar с именем
	// пользователя, корзина, избранное). Без сброса кэша роутера клиент оставил
	// бы отрисованный до входа layout — навбар показывал бы «Войти» вплоть до
	// полной перезагрузки страницы. Раньше это было не заметно: payload-token
	// выдавался ещё до экрана OTP, и layout успевал отрендериться уже с
	// пользователем.
	revalidatePath("/", "layout");

	// Оверлей поверх корзины/оформления уводить со страницы нельзя — в этом
	// весь его смысл. Возвращаем успех и отдаём решение клиенту; id
	// покупателя нужен ему, чтобы перенести гостевую корзину до перехода к
	// оформлению.
	if (flow === "overlay") {
		return actionSuccess<OtpVerifyResult>({ userId: pending.userId });
	}

	// redirect() именно здесь, а не router.push() на клиенте: навигация из
	// Server Action идёт уже после того, как выставлены cookies, и приносит
	// свежее RSC-дерево. redirect() бросает NEXT_REDIRECT, поэтому вызывается
	// вне try/catch — иначе исключение будет проглочено.
	redirect(REDIRECT_AFTER_LOGIN);
}
