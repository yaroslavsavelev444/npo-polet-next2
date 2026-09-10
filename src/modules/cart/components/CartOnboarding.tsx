"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import styles from "./Cart.module.css";

interface Props {
	onDismiss: () => void;
}

/**
 * Объяснение при первом добавлении товара.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ИМЕННО ТАК
 * ────────────────────────────────────────────────────────────────────────────
 * Корзина переехала со страницы в панель, и первое, что нужно человеку, —
 * понять, куда делся товар. Поэтому панель открывается сама, показывает
 * ТОВАР (он виден за подложкой, список не подменяется) и одновременно
 * объясняет, где он теперь лежит и как сюда вернуться.
 *
 * Карточка садится над нижней частью, а не в центр экрана: центр закрыл бы
 * ровно ту строку, ради которой всё и происходит. Кольцо выше обводит шапку
 * панели — то место, куда ведёт иконка в шапке сайта.
 *
 * Подсказка показывается ОДИН раз за аккаунт и снимается только явным
 * нажатием: закрытие по клику мимо означало бы «случайно промахнулся —
 * больше не увидишь».
 */
export function CartOnboarding({ onDismiss }: Props) {
	const buttonRef = useRef<HTMLButtonElement>(null);

	// Фокус уходит на кнопку подтверждения: пока подсказка на экране, она и
	// есть единственное осмысленное действие, и клавиатура должна начинать с неё.
	useEffect(() => {
		buttonRef.current?.focus({ preventScroll: true });
	}, []);

	return (
		<>
			<div className={styles.onboardingScrim} aria-hidden="true" />
			<div className={styles.onboardingRing} aria-hidden="true" />

			<div
				className={styles.onboardingCard}
				role="dialog"
				aria-modal="false"
				aria-labelledby="cart-onboarding-title"
				aria-describedby="cart-onboarding-text"
			>
				<p className={styles.onboardingBadge}>
					<Sparkles size={12} aria-hidden />
					Первый товар
				</p>
				<h3 className={styles.onboardingTitle} id="cart-onboarding-title">
					Товар в корзине
				</h3>
				<p className={styles.onboardingText} id="cart-onboarding-text">
					Всё выбранное складывается сюда. Панель открывается по значку корзины
					в шапке — с любой страницы и не прерывая просмотр. Дальше товары будут
					добавляться молча.
				</p>
				<button
					ref={buttonRef}
					type="button"
					className={styles.onboardingButton}
					onClick={onDismiss}
				>
					Понятно
				</button>
			</div>
		</>
	);
}
