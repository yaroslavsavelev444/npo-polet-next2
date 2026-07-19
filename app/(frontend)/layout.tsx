// app/(frontend)/layout.tsx

import "@once-ui-system/core/css/styles.css";
import "@once-ui-system/core/css/tokens.css";
import "./theme.css";
import "./globals.css";

import { Column, Flex, Meta } from "@once-ui-system/core";
import type { Viewport } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { AnalyticsGate } from "@/modules/cookie-consent/components/AnalyticsGate";
import { CookieConsentBanner } from "@/modules/cookie-consent/components/CookieConsentBanner";
import { FeedbackButton } from "@/modules/feedback/components/FeedbackButton";
import { getCachedSettings } from "@/payload/services/settings.service";
import { Providers } from "@/providers/Providers";
import { baseURL, home } from "@/resources/content";
import {
	buildOrganizationSchema,
	buildWebsiteSchema,
} from "@/shared/lib/seo/schema";
import { cn } from "@/utils/cn";
import Footer from "@/widgets/Footer/Footer";
import { HeaderSpacer } from "@/widgets/Header/HeaderSpacer";
import { StickyHeader } from "@/widgets/Header/StickyHeader";

const manrope = Manrope({
	weight: ["200", "300", "400", "500", "600", "700"],
	subsets: ["latin", "cyrillic"],
	variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
	weight: ["100", "200", "300", "400", "500", "600", "700"],
	subsets: ["latin", "cyrillic"],
	variable: "--font-mono",
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
				className={cn(manrope.variable, mono.variable)}
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
					<script
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(buildOrganizationSchema(settings)),
						}}
					/>
					<script
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(buildWebsiteSchema()),
						}}
					/>

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
