"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { AccountDeletionError, getAccountDeletionService } from "./lib/service";

async function getAuthedUser() {
	const payload = await getPayloadInstance();
	const { user } = await payload.auth({ headers: await headers() });
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
