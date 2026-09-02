"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
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

export async function createAccountDeletionRequestAction(input: {
	password: string;
	acknowledged: boolean;
}) {
	if (!input.acknowledged) {
		throw new Error("Подтвердите, что понимаете последствия удаления аккаунта");
	}
	if (!input.password) throw new Error("Введите пароль");

	const user = await getAuthedUser();
	const service = await getAccountDeletionService();
	const current = await service.getCurrentRequest(user.id);
	if (current?.status === "pending" || current?.status === "executing") {
		throw new AccountDeletionError(
			"Активная заявка уже существует",
			"ALREADY_PENDING",
		);
	}

	const request = await service.requestDeletion({
		userId: user.id,
		email: String(user.email),
		password: input.password,
	});
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
