export const dynamic = "force-dynamic";
export const revalidate = 0;

import { AuthShell } from "@/modules/auth/components/AuthShell";
import { listConsentsForAcceptance } from "@/modules/auth/lib/consents";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { getCachedSettings } from "@/payload/services/settings.service";
import { getAuthImages } from "@/utils/settings-helpers";
import { RegisterPageClient } from "./RegisterPageClient";

/**
 * Server Component: загружает список согласий через Payload Local API и
 * изображение для правой колонки из настроек админки.
 * Нет клиентского fetch — данные готовы при рендере.
 */
export default async function RegisterPage() {
	const payload = await getPayloadInstance();

	const [consentList, settings] = await Promise.all([
		listConsentsForAcceptance(payload),
		getCachedSettings(),
	]);

	const { registerUrl } = getAuthImages(settings);

	return (
		<AuthShell
			imageUrl={registerUrl}
			imageAlt="Регистрация в личном кабинете"
			variant="register"
		>
			<RegisterPageClient consents={consentList} />
		</AuthShell>
	);
}
