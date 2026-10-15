"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeCreateOtp } from "@/modules/auth/lib/errorHandling";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { verifyOtpCode } from "@/modules/auth/lib/OtpStore";
import { RATE_LIMITS } from "@/modules/auth/lib/rateLimit";
import { getRequestMeta } from "@/modules/auth/lib/utils";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notifyOtpCode } from "@/services/notifications/notifyOtpCode";
import { AccountDeletionError, getAccountDeletionService } from "./lib/service";

/**
 * getCurrentUser, а не payload.auth: удаление аккаунта — операция покупателя,
 * и подставлять сюда id аккаунта персонала (коллекция `admins` с независимой
 * нумерацией) нельзя; заблокированный аккаунт тоже не должен инициировать
 * необратимые действия.
 */
async function getAuthedUser() {
	const user = await getCurrentUser();
	if (!user) redirect("/auth/login");
	return user;
}

/**
 * Код на почту вместо пароля — для аккаунта, у которого своего пароля нет
 * (заведён через Яндекс ID, hasPassword: false). Тот же смысл, что у пароля:
 * заявку создаёт владелец почты, а не тот, у кого открыта чужая вкладка.
 */
export async function sendAccountDeletionCodeAction(): Promise<void> {
	const user = await getAuthedUser();
	if (user.hasPassword !== false) {
		throw new Error("Для этого аккаунта заявку подтверждает пароль");
	}
	const rl = await RATE_LIMITS.otpResend(String(user.email));
	if (!rl.allowed) {
		throw new Error("Код уже отправлен. Повторно — через несколько минут.");
	}

	const payload = await getPayloadInstance();
	const { ip } = await getRequestMeta();
	const code = await safeCreateOtp(
		payload,
		{ userId: user.id, type: "account_delete", ip },
		"accountDeletion.createOtp",
	);
	if (!code) throw new Error("Не удалось отправить код. Попробуйте позже.");
	await notifyOtpCode({
		to: String(user.email),
		code,
		purpose: "account_delete",
	});
}

export async function createAccountDeletionRequestAction(input: {
	password?: string;
	code?: string;
	acknowledged: boolean;
}) {
	if (!input.acknowledged) {
		throw new Error("Подтвердите, что понимаете последствия удаления аккаунта");
	}

	const user = await getAuthedUser();
	const withoutPassword = user.hasPassword === false;
	if (withoutPassword ? !input.code : !input.password) {
		throw new Error(
			withoutPassword ? "Введите код из письма" : "Введите пароль",
		);
	}
	const service = await getAccountDeletionService();
	const current = await service.getCurrentRequest(user.id);
	if (current?.status === "pending" || current?.status === "executing") {
		throw new AccountDeletionError(
			"Активная заявка уже существует",
			"ALREADY_PENDING",
		);
	}

	if (withoutPassword) {
		const { ip } = await getRequestMeta();
		const rl = await RATE_LIMITS.otpVerify(ip);
		if (!rl.allowed)
			throw new Error("Слишком много попыток. Попробуйте позже.");
		const check = await verifyOtpCode(await getPayloadInstance(), {
			userId: String(user.id),
			type: "account_delete",
			code: String(input.code).trim(),
		});
		if (!check.ok) {
			throw new Error(
				check.reason === "invalid"
					? "Неверный код. Попробуйте ещё раз."
					: "Код недействителен. Запросите новый.",
			);
		}
	}

	const request = await service.requestDeletion(
		withoutPassword
			? { userId: user.id, email: String(user.email), confirmedByCode: true }
			: {
					userId: user.id,
					email: String(user.email),
					password: String(input.password),
				},
	);
	revalidatePath("/profile/delete-account");
	return request;
}

export async function cancelAccountDeletionRequestAction(requestId: string) {
	const user = await getAuthedUser();
	const service = await getAccountDeletionService();
	const request = await service.cancelDeletion(user.id, requestId);
	revalidatePath("/profile/delete-account");
	return request;
}
