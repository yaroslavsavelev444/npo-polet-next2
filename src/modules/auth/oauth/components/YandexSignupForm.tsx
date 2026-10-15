"use client";

import { useActionState, useState } from "react";
import { ConsentList } from "@/components/Consent/ConsentList";
import { Button } from "@/UI/Button/Button";
import { Input } from "@/UI/Input/Input";
import { AuthAlert } from "../../components/AuthAlert";
import type { AcceptedConsentInput } from "../../schemas/register.schema";
import type { ConsentListItem } from "../../types";
import { completeYandexSignupAction } from "../actions";

interface YandexSignupFormProps {
	email: string;
	defaultName: string;
	/** Почту подтвердил Яндекс — иначе после формы придёт наш код. */
	emailTrusted: boolean;
	consents: ConsentListItem[];
}

type State = Awaited<ReturnType<typeof completeYandexSignupAction>> | null;

/**
 * Последний шаг регистрации через Яндекс ID: почта уже известна (из Яндекса,
 * менять её здесь нельзя), осталось имя и согласия — те же документы, что и
 * при обычной регистрации (lib/consents.ts).
 */
export function YandexSignupForm({
	email,
	defaultName,
	emailTrusted,
	consents,
}: YandexSignupFormProps) {
	const [state, action, isPending] = useActionState(
		completeYandexSignupAction,
		null as State,
	);
	const [checkedSlugs, setCheckedSlugs] = useState<Record<string, boolean>>({});

	const allRequiredChecked = consents
		.filter((c) => c.isRequired)
		.every((c) => checkedSlugs[c.slug]);

	const nameError =
		state && !state.success ? state.fieldErrors?.name?.[0] : undefined;
	const consentsError =
		state && !state.success ? state.fieldErrors?.consents?.[0] : undefined;
	const nameValue =
		state && !state.success ? (state.values?.name ?? defaultName) : defaultName;

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
					Почти готово
				</h1>
				<p className="mt-2 text-sm text-[var(--text-secondary)]">
					Осталось проверить имя и принять условия — и аккаунт будет создан.
				</p>
			</div>

			<form action={handleSubmit} className="space-y-4">
				{state && !state.success && !nameError && !consentsError && (
					<AuthAlert message={state.error} code={state.code} />
				)}

				<Input
					id="email"
					label="Email из Яндекс ID"
					type="email"
					value={email}
					readOnly
					disabled
					fullWidth
				/>
				{!emailTrusted && (
					<p className="-mt-2 text-xs text-[var(--text-secondary)]">
						На эту почту придёт код — подтвердите, что она ваша.
					</p>
				)}

				<Input
					id="name"
					name="name"
					label="Имя"
					type="text"
					autoComplete="given-name"
					required
					disabled={isPending}
					placeholder="Иван"
					defaultValue={nameValue}
					errorMessage={nameError}
					fullWidth
				/>

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
					disabled={isPending || !allRequiredChecked}
				>
					Создать аккаунт
				</Button>
			</form>
		</div>
	);
}
