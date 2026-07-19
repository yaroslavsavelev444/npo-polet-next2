"use client";

import {
	Boxes,
	ChevronRight,
	FileText,
	Heart,
	LogIn,
	LogOut,
	Package,
	Phone,
	Star,
	User as UserIcon,
	X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { logoutAction } from "@/modules/auth/actions/logout";
import type { Category, User } from "@/payload-types";
import { cn } from "@/utils/cn";

interface Props {
	isOpen: boolean;
	onClose: () => void;
	user: User | null;
	categories: Category[];
}

// Длительность анимации входа/выхода. Держим в JS и CSS синхронно, чтобы
// панель не размонтировалась раньше, чем доиграет закрытие.
const ANIMATION_MS = 280;

export default function MobileMenu({
	isOpen,
	onClose,
	user,
	categories,
}: Props) {
	// mounted — присутствует ли оверлей в DOM (включая фазу закрытия);
	// entered — активна ли «открытая» стадия анимации.
	const [mounted, setMounted] = useState(false);
	const [entered, setEntered] = useState(false);
	const closeButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (isOpen) {
			setMounted(true);
			// Двойной requestAnimationFrame гарантирует, что стартовые (закрытые)
			// стили успеют примениться до перехода в открытое состояние — иначе
			// браузер «схлопнет» анимацию и панель появится рывком.
			const raf = requestAnimationFrame(() =>
				requestAnimationFrame(() => setEntered(true)),
			);
			return () => cancelAnimationFrame(raf);
		}

		setEntered(false);
		const timeout = setTimeout(() => setMounted(false), ANIMATION_MS);
		return () => clearTimeout(timeout);
	}, [isOpen]);

	// Блокируем прокрутку страницы, пока оверлей в DOM.
	useEffect(() => {
		if (!mounted) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [mounted]);

	// Escape закрывает меню; фокус уводим на кнопку закрытия при открытии.
	useEffect(() => {
		if (!isOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKeyDown);
		closeButtonRef.current?.focus();
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [isOpen, onClose]);

	if (!mounted || typeof document === "undefined") return null;

	return createPortal(
		<div
			className="fixed inset-0 z-[100] lg:hidden"
			role="dialog"
			aria-modal="true"
			aria-label="Меню навигации"
		>
			{/* Затемнение фона */}
			<button
				type="button"
				aria-label="Закрыть меню"
				onClick={onClose}
				className={cn(
					"absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300 ease-out",
					entered ? "opacity-100" : "opacity-0",
				)}
			/>

			{/* Панель меню */}
			<div
				className={cn(
					"absolute inset-x-0 top-0 max-h-[100dvh] overflow-y-auto",
					"bg-[var(--background)]/95 backdrop-blur-2xl",
					"border-b border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.5)]",
					"transition-all ease-[cubic-bezier(0.22,1,0.36,1)]",
					entered ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0",
				)}
				style={{ transitionDuration: `${ANIMATION_MS}ms` }}
			>
				<div className="mx-auto w-full max-w-2xl px-5 pb-8 pt-4">
					{/* Шапка панели */}
					<div className="flex items-center justify-between pb-4">
						<span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
							Меню
						</span>
						<button
							ref={closeButtonRef}
							type="button"
							onClick={onClose}
							aria-label="Закрыть меню"
							className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[var(--text-primary)] transition-colors hover:bg-white/10"
						>
							<X className="h-5 w-5" />
						</button>
					</div>

					{/* Bento-сетка */}
					<div className="flex flex-col gap-3">
						{/* Каталог */}
						{categories.length > 0 && (
							<BentoCard icon={<Boxes className="h-4 w-4" />} title="Каталог">
								<div className="grid grid-cols-2 gap-2">
									{categories.map((cat) => (
										<Link
											key={cat.id}
											href={`/category/${cat.slug}`}
											onClick={onClose}
											className="group flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-white/5 bg-white/[0.03] px-3.5 py-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--primary)]/40 hover:bg-[var(--primary)]/10"
										>
											<span className="line-clamp-2 text-left">{cat.name}</span>
											<ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" />
										</Link>
									))}
								</div>
							</BentoCard>
						)}

						{/* О нас + Аккаунт */}
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<BentoCard icon={<Phone className="h-4 w-4" />} title="О нас">
								<div className="flex flex-col gap-1">
									<MenuRow
										href="/agreements"
										onClick={onClose}
										icon={<FileText className="h-4 w-4" />}
										label="Соглашения"
									/>
									<MenuRow
										href="/contacts"
										onClick={onClose}
										icon={<Phone className="h-4 w-4" />}
										label="Контакты"
									/>
								</div>
							</BentoCard>

							<BentoCard
								icon={<UserIcon className="h-4 w-4" />}
								title="Аккаунт"
							>
								{user ? (
									<div className="flex flex-col gap-1">
										<MenuRow
											href="/profile"
											onClick={onClose}
											icon={<UserIcon className="h-4 w-4" />}
											label="Профиль"
										/>
										<MenuRow
											href="/orders"
											onClick={onClose}
											icon={<Package className="h-4 w-4" />}
											label="Мои заказы"
										/>
										<MenuRow
											href="/reviews"
											onClick={onClose}
											icon={<Star className="h-4 w-4" />}
											label="Мои отзывы"
										/>
										<MenuRow
											href="/wishlist"
											onClick={onClose}
											icon={<Heart className="h-4 w-4" />}
											label="Избранное"
										/>
										<form action={logoutAction} className="mt-1">
											<button
												type="submit"
												onClick={onClose}
												className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[var(--error)] transition-colors hover:bg-[var(--error)]/10"
											>
												<LogOut className="h-4 w-4" />
												Выйти
											</button>
										</form>
									</div>
								) : (
									<Link
										href="/auth/login"
										onClick={onClose}
										className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-hover)]"
									>
										<LogIn className="h-4 w-4" />
										Войти
									</Link>
								)}
							</BentoCard>
						</div>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}

function BentoCard({
	icon,
	title,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="rounded-[var(--radius-lg)] border border-white/10 bg-white/[0.04] p-4">
			<h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
				<span className="text-[var(--primary)]">{icon}</span>
				{title}
			</h3>
			{children}
		</section>
	);
}

function MenuRow({
	href,
	onClick,
	icon,
	label,
}: {
	href: string;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
}) {
	return (
		<Link
			href={href}
			onClick={onClick}
			className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-white/5"
		>
			<span className="text-[var(--text-muted)]">{icon}</span>
			{label}
		</Link>
	);
}
