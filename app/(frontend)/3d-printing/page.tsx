import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintServiceExperience } from "@/modules/print-service/components/PrintServiceExperience";
import { printPage } from "@/modules/print-service/content/print-service-content";
import { getCachedSettings } from "@/payload/services/settings.service";
import { baseURL } from "@/resources/content";
import {
	isPrintServiceEnabled,
	PRINT_SERVICE_PATH,
} from "@/utils/settings-helpers";

const PAGE_URL = `${baseURL}${PRINT_SERVICE_PATH}`;

const METADATA: Metadata = {
	title: printPage.meta.title,
	description: printPage.meta.description,
	alternates: { canonical: PAGE_URL },
	openGraph: {
		title: printPage.meta.title,
		description: printPage.meta.description,
		url: PAGE_URL,
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: printPage.meta.title,
		description: printPage.meta.description,
	},
};

// Метаданные проверяют ту же отметку: иначе у ответа 404 остались бы
// заголовок и canonical выключенной услуги.
export async function generateMetadata(): Promise<Metadata> {
	if (!isPrintServiceEnabled(await getCachedSettings())) notFound();
	return METADATA;
}

/**
 * Услуга «3D-печать на заказ».
 *
 * Доступность решается здесь, на сервере, а не скрытием ссылки: при
 * выключенной отметке «Настройки сайта → 3D-печать на заказ» страница
 * отвечает 404 и по прямому адресу. Настройки читаются тем же кэшированным
 * запросом, что и шапка (getCachedSettings, сброс — хуком глобала), так что
 * переключение в админке действует сразу, без выкладки.
 */
export default async function PrintServicePage() {
	const settings = await getCachedSettings();
	if (!isPrintServiceEnabled(settings)) notFound();

	return (
		// Как у главной: странице нужна полная ширина окна без вертикальных
		// полей общего layout — сцена идёт от шапки до подвала.
		<div
			className="full-bleed"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<PrintServiceExperience />
		</div>
	);
}
