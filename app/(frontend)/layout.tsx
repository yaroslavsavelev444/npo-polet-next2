// app/(frontend)/layout.tsx

import "@once-ui-system/core/css/styles.css";
import "@once-ui-system/core/css/tokens.css";
import "./theme.css";
import "./globals.css";

import { Column, Flex, Meta } from "@once-ui-system/core";
import type { Viewport } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import localFont from "next/font/local";
import { AnalyticsGate } from "@/modules/cookie-consent/components/AnalyticsGate";
import { CookieConsentBanner } from "@/modules/cookie-consent/components/CookieConsentBanner";
import { FeedbackButton } from "@/modules/feedback/components/FeedbackButton";
import { getCachedSettings } from "@/payload/services/settings.service";
import { Providers } from "@/providers/Providers";
import { baseURL, home } from "@/resources/content";
import { JsonLd } from "@/shared/components/JsonLd";
import {
	buildOrganizationSchema,
	buildWebsiteSchema,
} from "@/shared/lib/seo/schema";
import { cn } from "@/utils/cn";
import Footer from "@/widgets/Footer/Footer";
import { HeaderSpacer } from "@/widgets/Header/HeaderSpacer";
import { StickyHeader } from "@/widgets/Header/StickyHeader";

// Имена переменных намеренно НЕ --font-sans/--font-mono: эти два имени
// принадлежат теме Tailwind (@theme inline в globals.css). Пока next/font
// объявлял их сам, оба источника писали в одну переменную на <html>, и кто
// победит, решал порядок подключения стилей. Теперь у каждой переменной один
// владелец: next/font даёт сами шрифты, тема связывает их с --font-sans.
const manrope = Manrope({
	weight: ["200", "300", "400", "500", "600", "700"],
	subsets: ["latin", "cyrillic"],
	variable: "--font-manrope",
});

// Акцидентный шрифт заголовков. Лицензионный файл лежит в репозитории
// (src/assets/fonts), поэтому подключается через next/font/local, а не с
// Google Fonts: сборка не должна зависеть от внешней сети, а сам файл — от
// того, кто и когда его положит в public.
//
// ВАЖНО: PaluiSP2 — унициальная гарнитура, строчные буквы в ней отображаются
// теми же глифами, что и прописные (проверено: 'а' и 'А' указывают на один
// глиф Acyrillic). Поэтому она пригодна ТОЛЬКО для текста в верхнем регистре
// — за это отвечает класс .u-display в globals.css, который принудительно
// ставит text-transform: uppercase. Кегль у неё мелкий относительно em
// (капитель 700/1000), а начертание широкое, поэтому размеры подобраны
// крупнее, чем для Manrope, а трекинг — плотнее.
const display = localFont({
	src: [
		{
			path: "../../src/assets/fonts/PaluiSP2-Bold.woff2",
			weight: "700",
			style: "normal",
		},
		{
			path: "../../src/assets/fonts/PaluiSP2-Bold.woff",
			weight: "700",
			style: "normal",
		},
	],
	variable: "--font-palui",
	display: "swap",
	// Подмена на Manrope до загрузки: без выравнивания метрик заголовок
	// прыгает по высоте на swap. adjust-значения подобраны под капитель 700
	// и широкое начертание Palui.
	fallback: ["Manrope", "system-ui", "sans-serif"],
	adjustFontFallback: false,
});

const mono = IBM_Plex_Mono({
	weight: ["100", "200", "300", "400", "500", "600", "700"],
	subsets: ["latin", "cyrillic"],
	variable: "--font-ibm-plex-mono",
});

// Красит адресную строку/UI браузера на мобильных под тему ОС — то же значение,
// что theme_color/background_color в app/manifest.ts, чтобы вкладка, favicon и
// PWA-запуск выглядели согласованно в светлой и тёмной теме.
export const viewport: Viewport = {
	// viewport-fit=cover нужен, чтобы на устройствах с вырезами/жестовой
	// навигацией работали env(safe-area-inset-*) — их используют липкие панели
	// (напр. ProductStickyBar), чтобы не заезжать под системные элементы.
	viewportFit: "cover",
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#FF4500" },
		{ media: "(prefers-color-scheme: dark)", color: "#1A1D24" },
	],
};

export async function generateMetadata() {
	return {
		...Meta.generate({
			title: home.title,
			description: home.description,
			baseURL: baseURL,
			path: home.path,
			image: home.image,
		}),
		// Без metadataBase Next резолвит относительные OG/Twitter-пути от
		// http://localhost:3000 (он так и предупреждает на сборке) — в шаринге это
		// давало бы битые картинки. Значение общее для всех страниц, поэтому
		// задаётся здесь, в корневом layout, а не в каждой странице отдельно.
		metadataBase: new URL(baseURL),
	};
}

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const settings = await getCachedSettings();

	return (
		<Providers>
			<Flex
				as="html"
				lang="ru"
				fillWidth
				className={cn(manrope.variable, mono.variable, display.variable)}
				style={{ height: "100%" }}
			>
				<Column
					as="body"
					background="page"
					fillWidth
					style={{ minHeight: "100vh" }}
					margin="0"
					padding="0"
					horizontal="center"
				>
					<JsonLd data={buildOrganizationSchema(settings)} />
					<JsonLd data={buildWebsiteSchema()} />

					{/* Яндекс.Метрика подгружается только после согласия на
              аналитические cookie (см. AnalyticsGate). */}
					<AnalyticsGate />

					<StickyHeader />
					<HeaderSpacer />
					<Flex zIndex={0} fillWidth padding="l" horizontal="center" flex={1}>
						<Flex horizontal="center" fillWidth minHeight="0">
							{children}
							<FeedbackButton />
						</Flex>
					</Flex>

					<Footer />

					<CookieConsentBanner />
				</Column>
			</Flex>
		</Providers>
	);
}
