"use client";

import { BadgeCheck, LogOut, MailWarning } from "lucide-react";
import {
	type BreadcrumbItem,
	Breadcrumbs,
} from "@/components/Breadcrumbs/Breadcrumbs";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { Reveal, RevealLines } from "@/shared/components/motion/Reveal";
import { PageContainer } from "@/shared/components/PageContainer";
import { initialsOf, roleLabel, statusView } from "../lib/format";
import type { ProfileUser } from "../types/profile.types";
import styles from "./Profile.module.css";
import { RelativeTime } from "./RelativeTime";

interface ProfileHeroProps {
	user: ProfileUser;
	breadcrumbs: BreadcrumbItem[];
	onLogoutRequest: () => void;
}

/**
 * Первый экран кабинета.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КОМПОЗИЦИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Та же полоса, что открывает витрину каталога и страницу контактов:
 * --void-deep на всю ширину, один радиальный источник снизу слева, волосяной
 * шов по нижнему краю. Это не цитата ради цитаты — кабинет входит в тот же
 * верхний ярус навигации, что каталог и контакты, и обязан иметь такой же
 * вес.
 *
 * Правая колонка у каталога занята пояснением к разделу. Здесь на её месте
 * стоит ответ на вопрос «под кем я вошёл»: монограмма, имя, почта, признаки
 * состояния и дата последнего входа. Это ровно тот же уровень — то, что
 * нужно знать ДО того, как что-то менять.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ «ВЫЙТИ» ЗДЕСЬ, А НЕ В РАЗДЕЛЕ «АККАУНТ»
 * ────────────────────────────────────────────────────────────────────────────
 * Выход не принадлежит ни одному разделу: он завершает работу со ВСЕМ
 * кабинетом. Пока кнопка стояла внизу вкладки «Аккаунт», до неё надо было
 * сначала попасть в нужную вкладку, а из «Безопасности» она была не видна
 * вовсе. В блоке личности она стоит рядом с тем, из чего выходят, и видна с
 * любого раздела.
 *
 * Приглушённая, не красная: выход — обратимое действие (войти можно снова), и
 * красным в этой системе помечено только необратимое.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАГОЛОВОК
 * ────────────────────────────────────────────────────────────────────────────
 * Акцидентная PaluiSP2, строки разбиты вручную — как на витрине каталога.
 * Самое длинное слово, «КАБИНЕТ», занимает 7.9em: при верхней границе кегля
 * 4.25rem это 537px в колонке 800px, при нижней 1.625rem — 205px при 288,
 * доступных на экране 320px. Запас есть с обеих сторон; меняя текст, его
 * нужно пересчитать.
 */
export function ProfileHero({
	user,
	breadcrumbs,
	onLogoutRequest,
}: ProfileHeroProps) {
	const status = statusView(user.status);
	const emailVerified = user.emailVerified !== false;

	return (
		<section
			className="relative isolate overflow-hidden bg-[var(--void-deep)]"
			style={{
				// Шапка сайта — position: fixed, её место в потоке держит
				// HeaderSpacer. Первый экран заезжает ПОД неё (она полупрозрачная
				// с размытием), поэтому спейсер компенсируется отрицательным
				// полем, а содержимое возвращается вниз таким же паддингом.
				marginTop: "calc(-1 * var(--sticky-header-height))",
				paddingTop: "var(--sticky-header-height)",
			}}
		>
			<div
				className="pointer-events-none absolute inset-0 -z-10"
				aria-hidden="true"
				style={{
					background:
						"radial-gradient(110% 70% at 8% 100%, color-mix(in srgb, var(--primary) 13%, transparent) 0%, transparent 58%)",
				}}
			/>

			<div
				className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--rule)]"
				aria-hidden="true"
			/>

			<PageContainer className="flex flex-col pb-[clamp(2.5rem,5vw,4rem)] pt-[clamp(1.5rem,3vw,2.5rem)]">
				<Breadcrumbs items={breadcrumbs} />

				<div className="mt-[clamp(1.5rem,3vw,2.5rem)] flex flex-col gap-[clamp(1.75rem,3vw,3rem)] xl:flex-row xl:items-end xl:gap-[3rem]">
					<h1 className="u-display min-w-0 flex-1 text-[clamp(1.625rem,0.6rem+4.4vw,4.25rem)] leading-[0.96] text-[var(--text-primary)]">
						<RevealLines lines={["Личный", "кабинет"]} stagger={120} />
					</h1>

					<Reveal delay={240} className="xl:w-[24rem] xl:shrink-0">
						<div className={styles.identity}>
							<div className={styles.identityHead}>
								{/* Монограмма помечена aria-hidden: имя стоит строкой
								    правее, и повторное чтение двух букв ничего не
								    добавляет. */}
								<span className={styles.monogram} aria-hidden="true">
									{initialsOf(user.name, user.email)}
								</span>

								<span className="flex min-w-0 flex-col gap-0.5">
									<span className={styles.identityName} title={user.name}>
										{user.name}
									</span>
									<span className={styles.identityEmail} title={user.email}>
										{user.email}
									</span>
								</span>
							</div>

							<div className={styles.identityMeta}>
								<span className={styles.chip}>{roleLabel(user.role)}</span>

								{emailVerified ? (
									<span className={`${styles.chip} ${styles.chipOk}`}>
										<BadgeCheck size={12} aria-hidden />
										Почта подтверждена
									</span>
								) : (
									<span className={`${styles.chip} ${styles.chipWarn}`}>
										<MailWarning size={12} aria-hidden />
										Почта не подтверждена
									</span>
								)}

								{status && (
									<span
										className={`${styles.chip} ${
											status.tone === "danger"
												? styles.chipDanger
												: styles.chipWarn
										}`}
									>
										<span className={styles.chipDot} aria-hidden />
										{status.label}
									</span>
								)}
							</div>

							<div className={styles.identityFoot}>
								{user.lastLoginAt ? (
									<p className={catalog.micro}>
										Вход <RelativeTime iso={user.lastLoginAt} />
									</p>
								) : (
									<span />
								)}

								<button
									type="button"
									onClick={onLogoutRequest}
									className={`${styles.btn} ${styles.btnQuiet} ${styles.btnSmall}`}
								>
									<LogOut size={14} aria-hidden />
									Выйти
								</button>
							</div>
						</div>
					</Reveal>
				</div>
			</PageContainer>
		</section>
	);
}

export default ProfileHero;
