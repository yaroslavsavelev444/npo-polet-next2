"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ConsentList } from "@/components/Consent/ConsentList";
import { Button } from "@/UI/Button/Button";
import { AuthAlert } from "../../components/AuthAlert";
import type { AcceptedConsentInput } from "../../schemas/register.schema";
import type { ConsentListItem } from "../../types";
import { acceptLinkConsentAction } from "../actions";

type State = Awaited<ReturnType<typeof acceptLinkConsentAction>> | null;

/**
 * Согласие действующей редакции перед привязкой Яндекс ID к аккаунту,
 * который принимал старую (linkConsent.ts). Отказ — «Не привязывать»:
 * аккаунт остаётся как был, черновик привязки истечёт сам.
 */
export function YandexLinkConsentForm({
	consents,
	email,
}: {
	consents: ConsentListItem[];
	email: string | null;
}) {
	const [state, action, isPending] = useActionState(
		acceptLinkConsentAction,
		null as State,
	);
	const [checkedSlugs, setCheckedSlugs] = useState<Record<string, boolean>>({});
	const allChecked = consents.every((c) => checkedSlugs[c.slug]);
	const consentsError =
		state && !state.success ? state.fieldErrors?.consents?.[0] : undefined;

	const handleSubmit = (formData: FormData) => {
		const accepted: AcceptedConsentInput[] = consents
			.filter((c) => checkedSlugs[c.slug])
			.map((c) => ({ consentId: c.id, slug: c.slug, version: c.version }));
		formData.set("consentsJson", JSON.stringify(accepted));
		return action(formData);
	};

	return (
		<div className="w-full">
			<div className="mb-8">
				<h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
					Привязка Яндекс ID
				</h1>
				<p className="mt-2 text-sm text-[var(--text-secondary)]">
					{email ? (
						<>
							Чтобы входить через Яндекс ID{" "}
							<span className="font-medium text-[var(--text-primary)]">
								{email}
							</span>
							, примите обновлённое согласие на обработку персональных данных: в
							нём появился идентификатор учётной записи Яндекс ID.
						</>
					) : (
						"Чтобы входить через Яндекс ID, примите обновлённое согласие на обработку персональных данных: в нём появился идентификатор учётной записи Яндекс ID."
					)}
				</p>
			</div>

			<form action={handleSubmit} className="space-y-4">
				{state && !state.success && !consentsError && (
					<AuthAlert message={state.error} code={state.code} />
				)}

				<ConsentList
					consents={consents}
					checkedSlugs={checkedSlugs}
					onToggle={(slug) =>
						setCheckedSlugs((prev) => ({ ...prev, [slug]: !prev[slug] }))
					}
					disabled={isPending}
					error={consentsError}
				/>

				<Button
					type="submit"
					variant="primary"
					size="md"
					fullWidth
					loading={isPending}
					disabled={isPending || !allChecked}
				>
					Принять и привязать
				</Button>
			</form>

			<p className="mt-5 text-center text-sm">
				<Link
					href="/profile?tab=security"
					className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
				>
					Не привязывать
				</Link>
			</p>
		</div>
	);
}
