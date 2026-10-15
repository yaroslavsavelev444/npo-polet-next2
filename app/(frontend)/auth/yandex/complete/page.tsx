export const dynamic = "force-dynamic";
export const revalidate = 0;

import { notFound, redirect } from "next/navigation";
import { AuthShell } from "@/modules/auth/components/AuthShell";
import { listConsentsForAcceptance } from "@/modules/auth/lib/consents";
import { YandexSignupForm } from "@/modules/auth/oauth/components/YandexSignupForm";
import { isYandexIdEnabled } from "@/modules/auth/oauth/config";
import { readPendingSignup } from "@/modules/auth/oauth/flowStore";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { getCachedSettings } from "@/payload/services/settings.service";
import { getAuthImages } from "@/utils/settings-helpers";

/**
 * Регистрация через Яндекс ID, последний шаг: имя и согласия.
 *
 * Сюда попадают только с черновиком из callback (cookie oauth-signup →
 * Redis); без него — на вход. Полностью вошедших уводит proxy.ts (путь —
 * в его списке гостевых).
 */
export default async function YandexCompletePage() {
	if (!(await isYandexIdEnabled())) notFound();

	const draft = await readPendingSignup();
	if (!draft) redirect("/auth/login?oauth_error=expired");

	const payload = await getPayloadInstance();
	const [consents, settings] = await Promise.all([
		listConsentsForAcceptance(payload),
		getCachedSettings(),
	]);
	const { registerUrl } = getAuthImages(settings);

	return (
		<AuthShell
			imageUrl={registerUrl}
			imageAlt="Регистрация через Яндекс ID"
			variant="register"
		>
			<YandexSignupForm
				email={draft.email}
				defaultName={draft.name}
				emailTrusted={draft.emailTrusted}
				consents={consents}
			/>
		</AuthShell>
	);
}
