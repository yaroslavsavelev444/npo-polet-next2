"use client";

import { MonitorSmartphone, ShieldCheck, User } from "lucide-react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import {
	type SegmentedTabItem,
	SegmentedTabs,
} from "@/shared/components/segmented/SegmentedTabs";
import type { ProfileTab } from "../types/profile.types";

const ITEMS: SegmentedTabItem<ProfileTab>[] = [
	{ key: "account", label: "Аккаунт", icon: <User size={14} aria-hidden /> },
	{
		key: "security",
		label: "Безопасность",
		icon: <ShieldCheck size={14} aria-hidden />,
	},
	{
		key: "sessions",
		label: "Устройства",
		icon: <MonitorSmartphone size={14} aria-hidden />,
	},
];

interface ProfileNavProps {
	active: ProfileTab;
	onChange: (tab: ProfileTab) => void;
	/** Число активных устройств — счётчик у своего раздела. */
	sessionCount: number;
}

/**
 * Навигация по разделам кабинета.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ СЕГМЕНТЫ В ЛИПКОЙ ПАНЕЛИ, А НЕ ВКЛАДКИ С ПОДЧЁРКИВАНИЕМ
 * ────────────────────────────────────────────────────────────────────────────
 * Панель — та же .rail, что держит управление выдачей каталога: класс тот же
 * самый, поэтому две страницы не могут разъехаться ни по росту, ни по
 * материалу, ни по поведению при прокрутке. В кабинете это не украшение:
 * список устройств бывает длиннее экрана, и переключиться на другой раздел из
 * его конца, не прокручивая обратно наверх, можно только так.
 *
 * Сам переключатель — общий SegmentedTabs: он же отбирает заказы по статусу на
 * странице «Мои заказы». Переезжающая подсветка, обход стрелками и замер
 * геометрии живут там, здесь остаётся только набор разделов.
 */
export function ProfileNav({
	active,
	onChange,
	sessionCount,
}: ProfileNavProps) {
	const items = ITEMS.map((item) =>
		item.key === "sessions" ? { ...item, count: sessionCount } : item,
	);

	return (
		<div className={catalog.rail}>
			<div className={catalog.railRow}>
				<SegmentedTabs
					items={items}
					value={active}
					onChange={onChange}
					label="Разделы кабинета"
					idPrefix="profile"
				/>
			</div>
		</div>
	);
}

export default ProfileNav;
