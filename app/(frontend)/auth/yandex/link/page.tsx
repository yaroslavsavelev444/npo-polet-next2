export const dynamic = "force-dynamic";
export const revalidate = 0;

import { notFound, redirect } from "next/navigation";
import { AuthShell } from "@/modules/auth/components/AuthShell";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { YandexLinkConsentForm } from "@/modules/auth/oauth/components/YandexLinkConsentForm";
import { isYandexIdEnabled } from "@/modules/auth/oauth/config";
import { readPendingLink } from "@/modules/auth/oauth/flowStore";
import { findOutdatedLinkConsents } from "@/modules/auth/oauth/linkConsent";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { getCachedSettings } from "@/payload/services/settings.service";
import { getAuthImages } from "@/utils/settings-helpers";

export const metadata = {
	title: "Привязка Яндекс ID",
	robots: { index: false, follow: false },
};

/**
 * Согласие перед привязкой Яндекс ID к существующему аккаунту
 * (oauth/linkConsent.ts). Сюда попадают только вошедшим и только с черновиком
 * привязки этого же покупателя — из callback (привязка из кабинета) или после
 * кода на почту (verifyOtpAction).
 */
export default async function YandexLinkConsentPage() {
	if (!(await isYandexIdEnabled())) notFound();

	const user = await getCurrentUser();
	if (!user) redirect("/auth/login");

	const pending = await readPendingLink();
	if (!pending || pending.userId !== String(user.id)) {
		redirect("/profile?tab=security&oauth_error=expired");
	}

	const payload = await getPayloadInstance();
	const [consents, settings] = await Promise.all([
		findOutdatedLinkConsents(payload, user.id),
		getCachedSettings(),
	]);
	const { loginUrl } = getAuthImages(settings);

	return (
		<AuthShell
			imageUrl={loginUrl}
			imageAlt="Привязка Яндекс ID"
			variant="login"
		>
			<YandexLinkConsentForm consents={consents} email={pending.email} />
		</AuthShell>
	);
}
