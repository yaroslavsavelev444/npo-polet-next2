export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
	cancelAccountDeletionRequestAction,
	createAccountDeletionRequestAction,
} from "@/modules/account-deletion/actions";
import { AccountDeletionPageClient } from "@/modules/account-deletion/components/AccountDeletionPageClient";
import { getAccountDeletionService } from "@/modules/account-deletion/lib/service";
import { getPayloadInstance } from "@/payload/services/getPayload";

export const metadata: Metadata = {
	title: "Удаление аккаунта",
	robots: { index: false, follow: false },
};

export default async function DeleteAccountPage() {
	if (!(await cookies()).get("payload-token")) redirect("/auth/login");
	const payload = await getPayloadInstance();
	const { user } = await payload.auth({ headers: await headers() });
	if (!user) redirect("/auth/login");

	const service = await getAccountDeletionService();
	const request = await service.getCurrentRequest(user.id);

	return (
		<AccountDeletionPageClient
			request={request}
			createRequest={createAccountDeletionRequestAction}
			cancelRequest={cancelAccountDeletionRequestAction}
		/>
	);
}
