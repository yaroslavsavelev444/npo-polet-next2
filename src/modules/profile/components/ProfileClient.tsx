"use client";

import { useCallback, useEffect, useState } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { PageContainer } from "@/shared/components/PageContainer";
import { formatDateTime } from "../lib/format";
import type {
	ChangePasswordPayload,
	ProfileSession,
	ProfileTab,
	ProfileUser,
	UpdateAccountPayload,
} from "../types/profile.types";
import { AccountTab } from "./AccountTab";
import { LogoutConfirmModal } from "./LogoutConfirmModal";
import styles from "./Profile.module.css";
import { ProfileHero } from "./ProfileHero";
import { ProfileNav } from "./ProfileNav";
import { SecurityTab } from "./SecurityTab";
import { SessionsTab } from "./SessionsTab";

const TAB_KEYS: ProfileTab[] = ["account", "security", "sessions"];

const BREADCRUMBS = [
	{ title: "Главная", href: "/" },
	{ title: "Личный кабинет", href: "/profile" },
];

interface ProfileClientProps {
	user: ProfileUser;
	sessions: ProfileSession[];
	/** Раздел, разобранный сервером из адреса. */
	initialTab: ProfileTab;
	actions: {
		updateAccount: (payload: UpdateAccountPayload) => Promise<void>;
		changePassword: (payload: ChangePasswordPayload) => Promise<void>;
		revokeSession: (sessionId: string) => Promise<void>;
		refreshSessions: () => Promise<ProfileSession[]>;
		logout: () => Promise<void>;
	};
}

/**
 * Личный кабинет.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КОМПОЗИЦИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Три яруса, как у витрины каталога, — и это не подражание, а один и тот же
 * способ вести по странице, от общего к частному:
 *
 *   1. первый экран — под кем я вошёл и что с аккаунтом;
 *   2. липкая панель — какие есть разделы и в каком я сейчас;
 *   3. секции — сами настройки, каждая с объяснением слева.
 *
 * Отличие от каталога в третьем ярусе, и оно продиктовано содержимым: там
 * сетка равнозначных карточек, здесь разнородные настройки с разной ценой
 * ошибки. Сетка уравняла бы смену пароля и ссылку на избранное.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * РАЗДЕЛ ЖИВЁТ В АДРЕСЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Раньше активная вкладка была только в состоянии компонента: обновление
 * страницы возвращало в «Аккаунт», ссылку на «Устройства» нельзя было
 * отправить, а кнопка «назад» уводила со страницы целиком — хотя по смыслу
 * должна была вернуть в предыдущий раздел.
 *
 * Пишется адрес через window.history.pushState — он интегрирован с роутером
 * Next (см. node_modules/next/dist/docs → app/guides/single-page-applications)
 * и не обращается к серверу: данные кабинета уже здесь, переключение раздела
 * не должно стоить сетевого обхода. push, а не replace: разделы — это места,
 * между которыми ходят, и «назад» обязан возвращать в предыдущее.
 *
 * Начальное значение приходит с сервера (initialTab), поэтому первая
 * отрисовка на сервере и на клиенте совпадают — расхождения гидратации нет.
 */
export function ProfileClient({
	user: initialUser,
	sessions: initialSessions,
	initialTab,
	actions,
}: ProfileClientProps) {
	const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
	const [user, setUser] = useState<ProfileUser>(initialUser);
	const [sessions, setSessions] = useState<ProfileSession[]>(initialSessions);
	const [logoutOpen, setLogoutOpen] = useState(false);

	const changeTab = useCallback((tab: ProfileTab) => {
		setActiveTab(tab);

		const url = new URL(window.location.href);
		// «Аккаунт» — раздел по умолчанию, и в адрес он не пишется: /profile и
		// /profile?tab=account — одна и та же страница.
		if (tab === "account") url.searchParams.delete("tab");
		else url.searchParams.set("tab", tab);

		window.history.pushState(null, "", `${url.pathname}${url.search}`);
	}, []);

	// Кнопки «назад»/«вперёд». Источник истины при таком переходе один — сам
	// адрес: состояние компонента о нём не знает.
	useEffect(() => {
		const adopt = () => {
			const value = new URLSearchParams(window.location.search).get("tab");
			setActiveTab(
				TAB_KEYS.includes(value as ProfileTab)
					? (value as ProfileTab)
					: "account",
			);
		};

		window.addEventListener("popstate", adopt);
		return () => window.removeEventListener("popstate", adopt);
	}, []);

	async function handleUpdateAccount(payload: UpdateAccountPayload) {
		// Ошибка намеренно не гасится: её ловит AccountTab и показывает рядом с
		// полем. Обновление локального состояния идёт только после успеха —
		// иначе на экране остаётся имя, которого нет в базе.
		await actions.updateAccount(payload);
		setUser((prev) => ({ ...prev, name: payload.name }));
	}

	async function handleRevokeSession(sessionId: string) {
		await actions.revokeSession(sessionId);
		setSessions((prev) => prev.filter((item) => item.id !== sessionId));
	}

	async function handleRefreshSessions() {
		setSessions(await actions.refreshSessions());
	}

	const otherDevices = sessions.filter((session) => !session.isCurrent).length;

	return (
		<>
			<ProfileHero
				user={user}
				breadcrumbs={BREADCRUMBS}
				onLogoutRequest={() => setLogoutOpen(true)}
			/>

			<PageContainer className="pb-[4rem]">
				{/* Панель разделов — прямой потомок колонки, без обёртки: её
				    собственный отступ задан в .rail, а обёртка ростом с панель
				    отняла бы у position: sticky ход (разбор — в
				    productCatalog/components/Catalog.module.css). */}
				<div className="flex flex-col">
					<ProfileNav
						active={activeTab}
						onChange={changeTab}
						sessionCount={sessions.length}
					/>

					{/* key по разделу: панель пересобирается, и на ней заново
					    отыгрывается появление. Заодно это сбрасывает набранное в
					    форме смены пароля при уходе из раздела — так и нужно,
					    оставлять пароль в памяти вкладки не за чем. */}
					<div
						key={activeTab}
						role="tabpanel"
						id={`profile-panel-${activeTab}`}
						aria-labelledby={`profile-tab-${activeTab}`}
						className={styles.panel}
					>
						{activeTab === "account" && (
							<AccountTab
								// Ключ включает почту и имя: после сохранения с сервера
								// может прийти иное значение, и поле обязано его
								// подхватить.
								key={`${user.id}:${user.name}`}
								user={user}
								onUpdate={handleUpdateAccount}
							/>
						)}

						{activeTab === "security" && (
							<SecurityTab onChangePassword={actions.changePassword} />
						)}

						{activeTab === "sessions" && (
							<SessionsTab
								sessions={sessions}
								onRevoke={handleRevokeSession}
								onRefresh={handleRefreshSessions}
							/>
						)}
					</div>

					{/* Хвост страницы — та же линия со служебной подписью, которой
					    отмечен конец выдачи каталога. Здесь она несёт справку: номер
					    аккаунта и дату входа спрашивает поддержка, и искать их не
					    должно быть негде. */}
					<div className={styles.tail}>
						<span aria-hidden className={styles.tailRule} />
						<p className={catalog.micro}>
							Аккаунт № {user.id}
							{user.lastLoginAt
								? ` · вход ${formatDateTime(user.lastLoginAt)}`
								: ""}
						</p>
						<span aria-hidden className={styles.tailRule} />
					</div>
				</div>
			</PageContainer>

			<LogoutConfirmModal
				open={logoutOpen}
				onClose={() => setLogoutOpen(false)}
				onConfirm={actions.logout}
				remainingDevices={otherDevices}
			/>
		</>
	);
}

export default ProfileClient;
