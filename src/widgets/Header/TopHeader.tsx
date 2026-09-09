// src/widgets/Header/TopHeader.tsx

import Link from "next/link";
import { getCachedSettings } from "@/payload/services/settings.service";
import { cn } from "@/utils/cn";
import { getPrimaryEmail, getPrimaryPhone } from "@/utils/settings-helpers";

/**
 * Служебная полоса над навбаром: контакты слева, второстепенная навигация
 * справа.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ПЕРЕДЕЛАНО ЦЕЛИКОМ
 * ────────────────────────────────────────────────────────────────────────────
 * Полоса была набрана компонентами @once-ui-system на подложке `bg-white/50`
 * — светлая плашка поверх тёмной витрины. Она не просто «отличалась по
 * цвету»: белый слой поверх тёмного фона читается как чужой элемент,
 * приклеенный сверху, и первым же перетягивал на себя внимание, хотя несёт
 * наименее важные ссылки на странице. Плюс собственная типографика
 * (variant="body-default-s") мимо шкалы, которой набраны главная и контакты.
 *
 * Теперь это самый тёмный слой шапки (--void-deep) с волосяной чертой по
 * низу. Материал темнее навбара — значит, читается ПОД ним: тяжёлая
 * поверхность отделяет структурную область, лёгкая привлекает внимание к
 * интерактивному. Иерархия «навбар главнее полосы» получается сама, без
 * уменьшения кегля до нечитаемого.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ВЫРАВНИВАНИЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Поля и предельная ширина повторяют NavbarShell (24px по краям, контент до
 * 1400px, прижат влево, НЕ центрирован). Иначе телефон и логотип стоят на
 * разных вертикалях, и две полосы шапки не читаются как одна деталь.
 * Меняя раскладку навбара, поправьте и здесь.
 *
 * Поля заданы в ПИКСЕЛЯХ, а не в rem, и это не небрежность: @once-ui-system
 * масштабирует корневой кегль по ширине окна (на 768px он 15px, а не 16px),
 * поэтому `px-[1.5rem]` давал 22.5px против жёстких 24px у навбара — телефон
 * стоял на полтора пикселя левее логотипа. Навбар задаёт отступ инлайновым
 * `padding: "12px 24px"`, значит и здесь единица должна быть той же.
 *
 * На мобильных полоса скрыта: её содержимое целиком продублировано в
 * бургер-меню, а в одну строку оно не помещается.
 */

/** Ссылки второго плана. Дублируют пункты бургер-меню на мобильных. */
const SECONDARY_LINKS = [
	// Отдельной страницы «О нас» в проекте нет: рассказ о компании — секция
	// главной с якорем #about (ManifestoSection). Раньше здесь стоял
	// href="/about" и вёл в 404.
	{ label: "О нас", href: "/#about" },
	{ label: "Контакты", href: "/contacts" },
	{ label: "Каталог", href: "/category" },
] as const;

/** `tel:` не принимает пробелы и скобки — оставляем цифры и ведущий плюс. */
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export const TopHeader = async () => {
	const settings = await getCachedSettings();
	const phone = getPrimaryPhone(settings);
	const email = getPrimaryEmail(settings);

	return (
		<div className="hidden w-full border-b border-[var(--rule)] bg-[var(--void-deep)] px-[24px] sm:block">
			<div className="flex w-full max-w-[1400px] items-center justify-between gap-[1.5rem] py-[8px]">
				{/* ── Контакты ──────────────────────────────────────────────
				    Набраны моноширинным: это данные, которые списывают,
				    набирают и сверяют, а не подпись — тот же приём, что у
				    цифр в характеристиках. Телефон ярче почты: звонят чаще,
				    чем пишут, и в одинаковом весе строка читалась бы как
				    один длинный идентификатор.

				    Классом .u-mono здесь пользоваться нельзя, хотя гарнитура
				    та же: он поднимает регистр (text-transform: uppercase), а
				    адрес почты — литерал, и «SALES@NPO-POLET.RU» читается как
				    другой адрес. Перебить его утилитой Tailwind не выйдет:
				    home.css подключён вне слоёв и выигрывает у любой слоистой
				    утилиты (см. шапку globals.css). */}
				<div className="flex min-w-0 items-center gap-[0.875rem]">
					{phone ? (
						<a
							href={telHref(phone)}
							className="shrink-0 font-mono text-[0.6875rem] leading-none tracking-[0.04em] tabular-nums text-[var(--text-secondary)] no-underline transition-colors duration-200 hover:text-[var(--text-primary)]"
						>
							{phone}
						</a>
					) : null}

					{phone && email ? (
						<span
							aria-hidden="true"
							className="h-[0.6875rem] w-px shrink-0 bg-[var(--rule)]"
						/>
					) : null}

					{email ? (
						<a
							href={`mailto:${email}`}
							className="truncate font-mono text-[0.6875rem] leading-none tracking-[0.04em] text-[var(--text-muted)] no-underline transition-colors duration-200 hover:text-[var(--text-primary)]"
						>
							{email}
						</a>
					) : null}
				</div>

				{/* ── Второстепенная навигация ──────────────────────────────
				    Ссылки набраны основной гарнитурой, а не моноширинной:
				    слева — данные, справа — язык интерфейса. Моноширинный на
				    обеих половинах превратил бы полосу в сплошную «консоль»,
				    и разница между «что набрать» и «куда перейти» пропала бы.

				    Подчёркивание выезжает от левого края, а не появляется
				    целиком: наведение получает направление и читается как
				    отклик на курсор, а не как подмена стиля. */}
				<nav aria-label="Дополнительная навигация" className="shrink-0">
					{/* Отрицательное поле снимает висящий межбуквенный интервал
					    после последней буквы: трекинг 0.08em входит в ширину
					    строки и отодвигал бы правый край ссылок на 1-2px правее
					    правого края навбара. */}
					<ul className="-mr-[0.08em] flex list-none items-center gap-[1.25rem] p-0 leading-none">
						{SECONDARY_LINKS.map((link) => (
							<li key={link.href} className="leading-none">
								<Link
									href={link.href}
									className={cn(
										"relative inline-block py-[0.125rem] text-[0.6875rem] font-medium uppercase leading-none tracking-[0.08em] text-[var(--text-muted)] no-underline",
										"transition-colors duration-200 hover:text-[var(--text-primary)] focus-visible:text-[var(--text-primary)]",
										"after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300 after:ease-[cubic-bezier(0.25,1,0.5,1)] after:content-['']",
										"hover:after:scale-x-100 focus-visible:after:scale-x-100",
									)}
								>
									{link.label}
								</Link>
							</li>
						))}
					</ul>
				</nav>
			</div>
		</div>
	);
};

export default TopHeader;
