import { Mail, Phone } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import type { CSSProperties } from "react";
import { SchemeSwitch } from "@/modules/color-scheme/components/SchemeSwitch";
import {
	parseSchemePreference,
	SCHEME_COOKIE,
} from "@/modules/color-scheme/lib/scheme";
import { SOCIAL_PLATFORM_LABELS } from "@/modules/contact/content/contacts-content";
import { telHref } from "@/modules/contact/lib/format";
import { socialConfig } from "@/modules/contact/lib/social-config";
import { getCachedCategories } from "@/payload/services/categories.service";
import { getCachedConsents } from "@/payload/services/consents.service";
import { getCachedSettings } from "@/payload/services/settings.service";
import type { Consent } from "@/payload-types";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { DrawnRule } from "@/shared/components/motion/DrawnRule";
import { cn } from "@/utils/cn";
import {
	getCompanyName,
	getLegalAddress,
	getPrimaryEmail,
	getPrimaryPhone,
	getSocialLinks,
	getWorkingHours,
} from "@/utils/settings-helpers";
import { BackToTop } from "./BackToTop";
import styles from "./Footer.module.css";
import { FooterReveal } from "./FooterReveal";
import {
	ACCOUNT_LINKS,
	COMPANY_LINKS,
	type FooterGroup,
	MAX_FOOTER_CATEGORIES,
} from "./footer-nav";

/**
 * Подвал витрины.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ЗДЕСЬ ПРОИСХОДИТ И ПОЧЕМУ ИМЕННО ТАК
 * ────────────────────────────────────────────────────────────────────────────
 * Подвал — единственный блок, который посетитель видит на каждой странице
 * сайта, поэтому он обязан отвечать на четыре вопроса и ни на один больше:
 * чей это сайт, как связаться, куда ещё пойти, на каких условиях всё это
 * работает. Отсюда пять зон сверху вниз: знак с подписью, полка каналов
 * связи, ряд соцсетей, колонки разделов, строка реквизитов.
 *
 * ЦЕЛЕВЫХ КНОПОК ЗДЕСЬ НЕТ НАМЕРЕННО. На главной подвал идёт сразу за
 * финальным призывом, у которого ровно те же два действия («Смотреть
 * продукцию» → /category, «Написать менеджеру» → /contacts). Третья пара
 * кнопок через 80 пикселей после второй — это не усиление, а шум. Их роль
 * играет полка каналов: телефон и почта набраны крупно, вся строка целиком
 * является ссылкой и по площади нажатия больше любой кнопки.
 *
 * СОСТАВ ДАННЫХ. Настройки, соглашения и категории тянутся параллельно и все
 * три закэшированы. Категории запрашиваются С ТЕМИ ЖЕ параметрами, что и в
 * Navbar ({ isActive: true, sort: "order" }), чтобы попасть в уже прогретую
 * запись кэша, а не завести вторую с тем же содержимым.
 *
 * ЧЕГО ЗДЕСЬ НЕТ. Пользователь не запрашивается: ради подсветки личных
 * разделов подвал в корневом макете добавил бы обращение к сессии на каждой
 * странице сайта. Личные ссылки показываются всем — страницы сами уводят на
 * вход.
 */

/** Строка бренда — та же, что в мобильном меню и в первом экране главной. */
const STRAPLINE = "Перехват, а не поражение";

export interface FooterProps {
	className?: string;
}

export default async function Footer({ className }: FooterProps = {}) {
	const [settings, consentsResult, categoriesResult, cookieStore] =
		await Promise.all([
			getCachedSettings(),
			getCachedConsents({ isActive: true, sort: "title" }),
			getCachedCategories({ isActive: true, sort: "order" }),
			cookies(),
		]);
	// Выбор темы из cookie — чтобы переключатель в подвале пришёл с сервера
	// уже в верном положении, а не перескакивал после гидратации.
	const schemePreference = parseSchemePreference(
		cookieStore.get(SCHEME_COOKIE)?.value,
	);

	const companyName = getCompanyName(settings) || "НПО «Полёт»";
	const phone = getPrimaryPhone(settings);
	const email = getPrimaryEmail(settings);
	const workingHours = getWorkingHours(settings);
	const legalAddress = getLegalAddress(settings);
	const socialLinks = getSocialLinks(settings);

	const categories = (categoriesResult?.docs || []).slice(
		0,
		MAX_FOOTER_CATEGORIES,
	);

	// Соглашения приходят из админки. Запасной список нужен на случай пустой
	// коллекции: юридические ссылки в подвале — требование, а не украшение, и
	// подвал без них выглядит недоделанным ровно до первой проверки.
	const consentLinks = (consentsResult?.docs || []).map((consent: Consent) => ({
		label: consent.title,
		path: `/consents/${consent.slug}`,
	}));
	const legalLinks =
		consentLinks.length > 0
			? consentLinks
			: [
					{ label: "Политика конфиденциальности", path: "/consents/privacy" },
					{ label: "Правила продажи товаров", path: "/consents/terms" },
					{
						label: "Пользовательское соглашение",
						path: "/consents/user-agreement",
					},
					{ label: "Публичная оферта", path: "/consents/offer" },
					{ label: "Файлы куки", path: "/consents/cookie" },
					{
						label: "Согласие на обработку данных",
						path: "/consents/personal-data",
					},
				];

	const groups: FooterGroup[] = [
		{
			title: "Каталог",
			links: [
				...categories.map((category) => ({
					label: category.name,
					href: `/category/${category.slug}`,
					title: category.name,
				})),
				{ label: "Все категории", href: "/category" },
			],
		},
		{ title: "Компания", links: COMPANY_LINKS },
		{ title: "Кабинет", links: ACCOUNT_LINKS },
	];

	// Ячейки полки каналов считаются заранее: число колонок уезжает в CSS
	// переменной, потому что их бывает две или три, и repeat(auto-fit)
	// растянул бы две на всю ширину, оставив значения посреди пустоты.
	const channelCount = [phone, email, workingHours].filter(Boolean).length;

	// Порядковый номер блока в каскаде появления. Считается сквозным, а не с
	// нуля в каждой зоне: иначе нижняя строка проявлялась бы одновременно с
	// первой колонкой.
	let order = 0;

	return (
		<footer className={cn(styles.footer, className)}>
			<div className={cn("rule-ticked", styles.seam)} aria-hidden="true" />
			<div className={styles.glow} aria-hidden="true" />

			<FooterReveal>
				<div
					className={cn(styles.head, styles.item)}
					style={{ "--i": order++ } as CSSProperties}
				>
					<Link href="/" className={styles.mark} aria-label="На главную">
						<BrandLogo alt={companyName} className={styles.logo} />
					</Link>

					<p className={cn("u-display", styles.strap)}>{STRAPLINE}</p>
				</div>

				{channelCount > 0 ? (
					<div
						className={cn(styles.channels, styles.item)}
						style={
							{
								"--i": order++,
								"--channel-cols": channelCount,
							} as CSSProperties
						}
					>
						{phone ? (
							<a href={telHref(phone)} className={styles.channel}>
								<span className={styles.channelBody}>
									<span className={styles.channelLabel}>Телефон</span>
									<span className={styles.channelValue}>{phone}</span>
								</span>
								<Phone className={styles.channelIcon} aria-hidden="true" />
							</a>
						) : null}

						{email ? (
							<a href={`mailto:${email}`} className={styles.channel}>
								<span className={styles.channelBody}>
									<span className={styles.channelLabel}>Почта</span>
									<span className={styles.channelValue}>{email}</span>
								</span>
								<Mail className={styles.channelIcon} aria-hidden="true" />
							</a>
						) : null}

						{workingHours ? (
							<div className={styles.channel}>
								<span className={styles.channelBody}>
									<span className={styles.channelLabel}>График</span>
									<span className={cn(styles.channelValue, styles.channelNote)}>
										{workingHours}
									</span>
								</span>
							</div>
						) : null}
					</div>
				) : null}

				{/* Соцсети — плитками со знаком площадки, без подписей: ряд
				    из шести подписанных ссылок занял бы целую колонку ради
				    того, что узнаётся по знаку. Название остаётся в
				    aria-label и в title. Площадка без ссылки сюда не попадает
				    (getSocialLinks), пустой ряд не выводится вовсе. */}
				{socialLinks.length > 0 ? (
					<div
						className={cn(styles.socials, styles.item)}
						style={{ "--i": order++ } as CSSProperties}
					>
						<h2 className={styles.groupTitle}>Мы в сети</h2>
						<ul className={styles.socialList}>
							{socialLinks.map((link) => {
								const { icon: Icon, color } = socialConfig[link.platform];
								const platformLabel = SOCIAL_PLATFORM_LABELS[link.platform];
								const label = link.title
									? `${platformLabel} — ${link.title}`
									: platformLabel;

								return (
									<li key={link.url}>
										<a
											href={link.url}
											target="_blank"
											rel="noopener noreferrer"
											aria-label={label}
											title={label}
											className={styles.social}
											style={{ "--net-tint": color } as CSSProperties}
										>
											<Icon className={styles.socialIcon} aria-hidden="true" />
										</a>
									</li>
								);
							})}
						</ul>
					</div>
				) : null}

				<nav className={styles.nav} aria-label="Разделы сайта">
					{groups.map((group) => (
						<div
							key={group.title}
							className={cn(styles.group, styles.item)}
							style={{ "--i": order++ } as CSSProperties}
						>
							<h2 className={styles.groupTitle}>{group.title}</h2>
							<ul className={styles.list}>
								{group.links.map((link) => {
									// «Все категории» отбивается чертой только когда над ней
									// действительно есть категории — иначе линия висит
									// над единственным пунктом.
									const isAll =
										link.href === "/category" && categories.length > 0;
									// Подпись обрезается на второй строке во ВСЕХ колонках, а не
									// только у категорий: названия приходят из админки, и
									// правило, работающее лишь для сегодняшних данных, — это
									// отложенная поломка ряда.
									const body = (
										<span className={cn(styles.linkText, styles.linkClamp)}>
											{link.label}
										</span>
									);

									return (
										<li key={link.href} className={cn(isAll && styles.itemAll)}>
											<Link
												href={link.href}
												title={link.title}
												className={styles.link}
											>
												{body}
											</Link>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</nav>

				<DrawnRule className={styles.rule} />

				<div
					className={cn(styles.legal, styles.item)}
					style={{ "--i": order++ } as CSSProperties}
				>
					<p className={styles.legalMeta}>
						{/* Год берётся в момент рендера. Все маршруты витрины серверные и
						    динамические (см. вывод сборки), поэтому он не «застывает» на
						    дате сборки, как это было бы у статически предгенерированной
						    страницы. */}
						<span className={styles.legalName}>
							© {new Date().getFullYear()} {companyName}
						</span>
						{legalAddress ? <span>{legalAddress}</span> : null}
					</p>

					<div className={styles.legalSide}>
						<ul className={styles.legalLinks}>
							{legalLinks.map((link) => (
								<li key={link.path}>
									<Link
										href={link.path}
										className={cn(styles.link, styles.legalLink)}
									>
										<span className={styles.linkText}>{link.label}</span>
									</Link>
								</li>
							))}
						</ul>

						<div className={styles.legalActions}>
							<SchemeSwitch serverPreference={schemePreference} />
							<BackToTop />
						</div>
					</div>
				</div>
			</FooterReveal>

			<FooterNoScriptStyles />
		</footer>
	);
}

/**
 * Показывает подвал целиком, когда JavaScript отключён.
 *
 * Базовое состояние блоков — скрытое (см. .item в Footer.module.css), и без
 * этого правила посетитель без JS получил бы пустую тёмную полосу вместо
 * контактов и юридических ссылок. Приём и его место — те же, что у
 * FaqNoScriptStyles: правило живёт рядом с тем, что оно спасает.
 */
function FooterNoScriptStyles() {
	return (
		<noscript>
			<style>{`.${styles.item}{opacity:1!important;transform:none!important;filter:none!important}`}</style>
		</noscript>
	);
}
