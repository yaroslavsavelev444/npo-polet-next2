"use client";

import { AlertCircle, CheckCircle2, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import styles from "@/modules/profile/components/Profile.module.css";
import { formatDate } from "@/modules/profile/lib/format";
import { OAuthErrorNotice } from "./OAuthErrorNotice";
import { useOAuthProviders } from "./OAuthProvidersContext";
import { YandexIdButton } from "./YandexIdButton";

export interface LoginMethodIdentity {
	id: number;
	emailAtLink: string | null;
	createdAt: string;
}

type ActionResult =
	| { success: true; data: unknown }
	| { success: false; error: string };

interface LoginMethodsSectionProps {
	identities: LoginMethodIdentity[];
	/** false — аккаунт заведён через Яндекс ID, своего пароля нет. */
	hasPassword: boolean;
	onUnlink: (identityId: number) => Promise<ActionResult>;
	onSendSetPasswordLink: () => Promise<ActionResult>;
}

/**
 * «Способы входа» во вкладке «Безопасность»: пароль и Яндекс ID.
 *
 * Отвязать последний способ входа нельзя (это проверяет и сервер,
 * unlinkOAuthIdentityAction): у аккаунта без пароля после отвязки не осталось
 * бы ни одного входа. Поэтому без пароля первым делом предлагается его задать
 * — письмом со ссылкой на почту аккаунта.
 */
export function LoginMethodsSection({
	identities,
	hasPassword,
	onUnlink,
	onSendSetPasswordLink,
}: LoginMethodsSectionProps) {
	const { yandex } = useOAuthProviders();
	const [linked, setLinked] = useState(identities);
	const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
		null,
	);
	const [isPending, startTransition] = useTransition();

	// Фича выключена и привязок нет — показывать нечего.
	if (!yandex && linked.length === 0 && hasPassword) return null;

	const yandexIdentity = linked[0];
	const canUnlink = hasPassword || linked.length > 1;

	function unlink(identityId: number) {
		setMessage(null);
		startTransition(async () => {
			const result = await onUnlink(identityId);
			if (result.success) {
				setLinked((prev) => prev.filter((i) => i.id !== identityId));
				setMessage({ ok: true, text: "Яндекс ID отвязан." });
			} else {
				setMessage({ ok: false, text: result.error });
			}
		});
	}

	function sendSetPasswordLink() {
		setMessage(null);
		startTransition(async () => {
			const result = await onSendSetPasswordLink();
			setMessage(
				result.success
					? {
							ok: true,
							text: "Письмо со ссылкой отправлено на почту аккаунта. После установки пароля войдите заново.",
						}
					: { ok: false, text: result.error },
			);
		});
	}

	return (
		<section className={styles.section}>
			<div className={styles.sectionAside}>
				<h2 className={styles.sectionTitle}>Способы входа</h2>
				<p className={styles.sectionHint}>
					Вход через Яндекс ID не требует пароля и кода из письма. Отвязать его
					можно в любой момент, если у аккаунта есть пароль.
				</p>
			</div>

			<div className={styles.sectionBody}>
				<OAuthErrorNotice className="mb-3" />

				<ul className={styles.rows}>
					<li className={styles.row}>
						<span className={styles.rowIcon} aria-hidden>
							<KeyRound size={18} />
						</span>
						<span className={styles.rowMain}>
							<span className={styles.rowTitle}>
								<span className={styles.rowTitleText}>Пароль</span>
							</span>
							<span className={styles.rowMeta}>
								{hasPassword
									? "Задан — можно входить по почте и паролю"
									: "Не задан — вы входите через Яндекс ID"}
							</span>
						</span>
						{!hasPassword && (
							<button
								type="button"
								onClick={sendSetPasswordLink}
								disabled={isPending}
								className={`${styles.btn} ${styles.btnQuiet}`}
							>
								Задать пароль
							</button>
						)}
					</li>

					<li className={styles.row}>
						<span className={styles.rowIcon} aria-hidden>
							<svg width="18" height="18" viewBox="0 0 22 22" focusable="false">
								<circle cx="11" cy="11" r="11" fill="#FC3F1D" />
								<path
									d="M12.4 17.4h2.2V4.6h-3.2c-3.2 0-4.9 1.6-4.9 4.1 0 2 1 3.1 2.7 4.3l-3 4.4h2.4l3.3-4.9-1.1-.8c-1.4-.9-2-1.7-2-3.2 0-1.4.9-2.3 2.7-2.3h.9v11.2z"
									fill="#fff"
								/>
							</svg>
						</span>
						<span className={styles.rowMain}>
							<span className={styles.rowTitle}>
								<span className={styles.rowTitleText}>Яндекс ID</span>
							</span>
							<span className={styles.rowMeta}>
								{yandexIdentity
									? `Привязан${yandexIdentity.emailAtLink ? ` как ${yandexIdentity.emailAtLink}` : ""} · ${formatDate(yandexIdentity.createdAt)}`
									: "Не привязан"}
							</span>
						</span>
						{yandexIdentity ? (
							<button
								type="button"
								onClick={() => unlink(yandexIdentity.id)}
								disabled={isPending || !canUnlink}
								title={
									canUnlink
										? undefined
										: "Сначала задайте пароль — иначе войти в аккаунт будет нечем"
								}
								className={`${styles.btn} ${styles.btnQuiet}`}
							>
								Отвязать
							</button>
						) : null}
					</li>
				</ul>

				{!yandexIdentity && yandex && (
					<div className="mt-3 max-w-xs">
						<YandexIdButton
							intent="link"
							next="/profile?tab=security"
							label="Привязать Яндекс ID"
							disabled={isPending}
						/>
					</div>
				)}

				{message && (
					<p
						className={`${styles.notice} ${message.ok ? styles.noticeOk : styles.noticeError}`}
						role="status"
					>
						{message.ok ? (
							<CheckCircle2
								size={15}
								aria-hidden
								className={`${styles.noticeIcon} ${styles.noticeOkIcon}`}
							/>
						) : (
							<AlertCircle
								size={15}
								aria-hidden
								className={`${styles.noticeIcon} ${styles.noticeErrorIcon}`}
							/>
						)}
						{message.text}
					</p>
				)}
			</div>
		</section>
	);
}
