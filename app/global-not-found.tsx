// app/global-not-found.tsx
//
// 404 для URL, не совпавших ни с одним маршрутом.
//
// Зачем отдельный файл, если есть app/(frontend)/not-found.tsx: в проекте два
// КОРНЕВЫХ layout'а — витрина `(frontend)` и админка Payload `(payload)`. Для
// несуществующего маршрута Next не может выбрать, каким из них оборачивать
// страницу, поэтому not-found.tsx внутри группы не срабатывает и пользователь
// видел дефолтную страницу Next.js. Ровно этот случай и описан в
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// not-found.md («Your app has multiple root layouts... so there's no single
// layout to compose a global 404 from»). Включается флагом
// experimental.globalNotFound в next.config.ts.
//
// Файл рендерится в обход layout'ов, поэтому обязан сам вернуть полный
// html-документ и подключить стили и шрифт. Данные из Payload здесь
// намеренно не запрашиваются: на этот путь попадают в том числе сканеры и
// битые ссылки, и превращать каждый такой запрос в поход в БД нельзя.

import "./(frontend)/theme.css";
import "./(frontend)/globals.css";

import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import Link from "next/link";
import { NotFoundView } from "@/modules/error";

const manrope = Manrope({
	weight: ["400", "500", "600", "700"],
	subsets: ["latin", "cyrillic"],
	display: "swap",
	variable: "--font-sans",
});

export const metadata: Metadata = {
	title: "Страница не найдена — НПО Полёт",
	description: "Запрашиваемая страница отсутствует либо была перемещена.",
	robots: { index: false, follow: true },
};

export const viewport: Viewport = {
	themeColor: "#1A1D24",
};

export default function GlobalNotFound() {
	return (
		<html lang="ru" className={manrope.variable}>
			<body
				style={{
					margin: 0,
					minHeight: "100svh",
					display: "flex",
					flexDirection: "column",
					background: "var(--background)",
					color: "var(--text-primary)",
					fontFamily: "var(--font-sans), system-ui, sans-serif",
				}}
			>
				{/* Минимальная шапка вместо общей: без неё страница выглядит
				    выпавшей из сайта, а тянуть сюда настоящий Header нельзя —
				    он ходит в Payload за настройками. */}
				<header className="flex w-full items-center justify-center border-b border-[var(--border)] !px-4 !py-4">
					<Link
						href="/"
						className="rounded-sm text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)] transition-colors hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
					>
						НПО&nbsp;Полёт
					</Link>
				</header>

				<div className="flex flex-1 items-center justify-center">
					<NotFoundView />
				</div>
			</body>
		</html>
	);
}
