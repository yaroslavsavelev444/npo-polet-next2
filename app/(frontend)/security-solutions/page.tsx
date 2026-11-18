import { ArrowDown, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TrustDocuments } from "@/modules/home/components/TrustDocuments";
import { trust } from "@/modules/home/content/home-content";
import { getHomeDocuments } from "@/modules/home/lib/documents";
import { ProductGrid } from "@/modules/productCard/components/productGrid";
import {
	SECURITY_SOLUTIONS_PATH,
	SECURITY_SOLUTIONS_TITLE,
} from "@/modules/security-solutions/route";
import { getSecuritySolutionSelection } from "@/payload/services/security-solutions.service";
import { getCachedSettings } from "@/payload/services/settings.service";
import { baseURL } from "@/resources/content";
import { LandingHeroSurface } from "@/shared/components/LandingHeroSurface";
import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { PageContainer } from "@/shared/components/PageContainer";
import styles from "./SecuritySolutions.module.css";

const TITLE_LINES = ["Готовые решения", "для ЧОП"];

export const metadata: Metadata = {
	title: SECURITY_SOLUTIONS_TITLE,
	description:
		"Оборудование НПО «Полёт» для частных охранных предприятий. Товары, сертификаты и документация.",
	alternates: { canonical: `${baseURL}${SECURITY_SOLUTIONS_PATH}` },
};

export default async function SecuritySolutionsPage() {
	const [{ products, instructions }, settings] = await Promise.all([
		getSecuritySolutionSelection(),
		getCachedSettings(),
	]);
	const documentsByHref = new Map(
		getHomeDocuments(settings).map((document) => [document.href, document]),
	);
	const instructionsByHref = new Map(
		instructions
			.filter(({ href }) => !documentsByHref.has(href))
			.map((instruction) => [instruction.href, instruction]),
	);

	return (
		<main className={`full-bleed ${styles.page}`}>
			<LandingHeroSurface>
				<PageContainer className={styles.hero}>
					<h1 className={`u-display ${styles.title}`}>
						<RevealLines lines={TITLE_LINES} stagger={130} />
					</h1>
					<Reveal delay={300} className={styles.heroContent}>
						<p>
							Оборудование для частных охранных предприятий, сертификаты и
							руководства по эксплуатации.
						</p>
						<nav className={styles.jump} aria-label="Разделы страницы">
							<a href="#equipment" className={styles.primary}>
								К товарам <ArrowDown aria-hidden size={16} />
							</a>
							<a href="#documents" className={styles.secondary}>
								К документам <ArrowDown aria-hidden size={16} />
							</a>
						</nav>
					</Reveal>
				</PageContainer>
			</LandingHeroSurface>

			<PageContainer className={styles.content}>
				<section
					id="equipment"
					className={styles.equipment}
					aria-labelledby="equipment-title"
				>
					<h2
						id="equipment-title"
						className={`u-display ${styles.sectionTitle}`}
					>
						Товары для ЧОП
					</h2>
					{products.length > 0 ? (
						<ProductGrid products={products} />
					) : (
						<p className={styles.empty}>
							Подборка пока пуста. Все изделия доступны в{" "}
							<Link href="/category">каталоге</Link>.
						</p>
					)}
				</section>

				<section
					id="documents"
					className={styles.documents}
					aria-labelledby="documents-title"
				>
					<h2
						id="documents-title"
						className={`u-display ${styles.sectionTitle}`}
					>
						Сертификаты и документация
					</h2>
					<div className={styles.documentColumns}>
						<div className={styles.documentColumn}>
							<TrustDocuments
								title={trust.documents.title}
								lead={trust.documents.lead}
								documents={[...documentsByHref.values()]}
								emptyMessage={
									<>
										Сертификаты можно запросить у{" "}
										<Link href="/contacts" className={styles.inlineLink}>
											отдела продаж
										</Link>
										.
									</>
								}
							/>
						</div>
						<div className={styles.documentColumn}>
							<TrustDocuments
								title="Инструкции"
								lead="Руководства по эксплуатации товаров из подборки."
								documents={[...instructionsByHref.values()]}
								emptyMessage="Инструкции к товарам из подборки появятся здесь после публикации."
							>
								<Link href="/knowledge" className={styles.knowledge}>
									Все инструкции в базе знаний
									<ArrowUpRight aria-hidden size={16} />
								</Link>
							</TrustDocuments>
						</div>
					</div>
				</section>
			</PageContainer>
		</main>
	);
}
