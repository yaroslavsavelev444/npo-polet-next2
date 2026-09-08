import type { Metadata } from "next";
import { mapFaqTopics, selectFeaturedQuestions } from "@/modules/faq";
import { AudienceSection } from "@/modules/home/components/AudienceSection";
import { DirectionsSection } from "@/modules/home/components/DirectionsSection";
import { FaqSection } from "@/modules/home/components/FaqSection";
import { FinalCta } from "@/modules/home/components/FinalCta";
import { HomeHero } from "@/modules/home/components/HomeHero";
import { ManifestoSection } from "@/modules/home/components/ManifestoSection";
import { PrincipleSection } from "@/modules/home/components/PrincipleSection";
import { ProductionSection } from "@/modules/home/components/ProductionSection";
import { ProductsShowcase } from "@/modules/home/components/ProductsShowcase";
import {
	ReadingProgress,
	SectionIndex,
} from "@/modules/home/components/SectionIndex";
import { TimelineSection } from "@/modules/home/components/TimelineSection";
import { TrustSection } from "@/modules/home/components/TrustSection";
import { faq as faqCopy } from "@/modules/home/content/home-content";
import { getCachedFaqTopics } from "@/payload/services/faq.service";
import { getCatalogData } from "@/payload/services/products.service";
import { getLatestApprovedReviews } from "@/payload/services/reviews.service";
import { getCachedSettings } from "@/payload/services/settings.service";
import { baseURL } from "@/resources/content";
import { getHeroBackground } from "@/utils/settings-helpers";

// Canonical задаётся здесь, а не в layout: layout общий для всех страниц, и
// указанный там canonical достался бы по наследству /contacts, /consents и
// прочим страницам без собственного canonical — все они схлопнулись бы в
// главную. Title/description при этом по-прежнему наследуются от layout.
export const metadata: Metadata = {
	alternates: { canonical: baseURL },
};

/**
 * Главная страница.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * СТРУКТУРА
 * ────────────────────────────────────────────────────────────────────────────
 * Порядок секций отвечает на вопросы в том порядке, в каком они возникают:
 * что это → почему именно так → что бывает → что купить → как это работает →
 * подойдёт ли мне → кто это делает → давно ли → чем подтверждается → что
 * ещё спрашивают → действие.
 *
 * Продукция стоит четвёртой, а не в конце: сюда приходят по запросам вида
 * «сеткомет купить», то есть с уже готовым намерением, и заставлять такого
 * посетителя пролистать пять экранов рассказа о компании — верный способ его
 * потерять. Всё, что объясняет и убеждает, идёт ПОСЛЕ карточек, для тех, кому
 * этого оказалось мало.
 *
 * Порядок обязан совпадать с sectionIndex в home-content.ts — по нему строится
 * липкий указатель слева.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДАННЫЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Четыре независимых запроса идут одним Promise.all: последовательно они
 * складывались бы в сумму задержек, а зависимости между ними нет ни одной.
 * Все четыре сервиса кэшируются с тегами и сбрасываются хуками Payload, так
 * что страница остаётся статической между правками в админке.
 */
export default async function Home() {
	const [catalog, faqTopics, reviews, settings] = await Promise.all([
		// Отбор для главной — существующий флаг товара
		// (inventory.showOnMainPage), а не отдельный список: администратор уже
		// умеет им пользоваться. Десять карточек — максимум, который может
		// понадобиться самой широкой раскладке (5 колонок × 2 ряда); лишние
		// на узких экранах прячет CSS, см. ProductsShowcase.
		getCatalogData({
			showOnMainPage: true,
			isVisible: true,
			limit: 10,
		}),
		getCachedFaqTopics(),
		getLatestApprovedReviews(3),
		getCachedSettings(),
	]);

	const heroBackground = getHeroBackground(settings);
	const featuredQuestions = selectFeaturedQuestions(
		mapFaqTopics(faqTopics),
		faqCopy.limit,
	);

	return (
		// Общий layout витрины кладёт страницу в центрированную колонку с
		// отступом padding="l" (--responsive-space-l: 40/24/16px по ширине).
		// Главной он не нужен: её секции сами задают и ширину контента
		// (компонент Container), и вертикальный ритм. .full-bleed возвращает
		// странице полную ширину окна, отрицательные поля снимают вертикальный
		// отступ — иначе над первым экраном и под подвалом остаются полосы фона.
		<div
			className="full-bleed"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<ReadingProgress />
			<SectionIndex />

			<HomeHero
				settingsVideoUrl={heroBackground.videoUrl}
				settingsImageUrl={heroBackground.imageUrl}
				settingsPosterUrl={heroBackground.posterUrl}
			/>

			<ManifestoSection />
			<DirectionsSection />
			<ProductsShowcase products={catalog.products} />
			<PrincipleSection />
			<AudienceSection />
			<ProductionSection />
			<TimelineSection />
			<TrustSection reviews={reviews} />
			<FaqSection questions={featuredQuestions} />
			<FinalCta />
		</div>
	);
}
