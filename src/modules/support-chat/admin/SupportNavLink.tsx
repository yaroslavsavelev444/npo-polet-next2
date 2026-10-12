"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./console/console.module.css";

interface Summary {
	queue: number;
	mineAwaiting: number;
	awaiting: number;
}

const POLL_MS = 30_000;

/**
 * Пункт «Чат поддержки» в меню админки со счётчиком ждущих ответа.
 *
 * Опрос раз в 30 секунд, а не сокет: меню есть на каждой странице админки, а
 * «на месте» менеджер считается только с открытой консолью (иначе
 * распределение отдавало бы диалоги тому, кто правит товары и чат не видит).
 * Пока вкладка скрыта — не опрашивает.
 */
export function SupportNavLink() {
	const pathname = usePathname();
	const [summary, setSummary] = useState<Summary | null>(null);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			if (document.hidden) return;
			try {
				const response = await fetch("/api/support/staff/summary", {
					credentials: "same-origin",
					cache: "no-store",
				});
				if (!response.ok) return;
				const data = (await response.json()) as Summary;
				if (!cancelled) setSummary(data);
			} catch {
				// Счётчик в меню — удобство; сбой сети не должен ничего ломать.
			}
		};
		void load();
		const timer = window.setInterval(load, POLL_MS);
		document.addEventListener("visibilitychange", load);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", load);
		};
	}, []);

	const active = pathname?.startsWith("/admin/support");
	const waiting = (summary?.queue ?? 0) + (summary?.mineAwaiting ?? 0);

	return (
		<a
			href="/admin/support"
			className={`nav__link ${styles.navLink} ${active ? styles.navLinkActive : ""}`}
			aria-current={active ? "page" : undefined}
		>
			<span className="nav__link-label">Чат поддержки</span>
			{waiting > 0 && (
				<span
					className={styles.navBadge}
					title={`В очереди: ${summary?.queue ?? 0}, ждут вашего ответа: ${summary?.mineAwaiting ?? 0}`}
				>
					{waiting}
				</span>
			)}
		</a>
	);
}
