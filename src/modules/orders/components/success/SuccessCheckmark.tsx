/**
 * Анимированный индикатор успеха: окружность и галочка отрисовываются штрихом,
 * контейнер мягко «выпрыгивает», вокруг расходятся два кольца-эха. Вся
 * анимация — на CSS (globals.css), поэтому компонент чисто презентационный и
 * не требует "use client". prefers-reduced-motion гасит движение там же.
 */
export function SuccessCheckmark() {
	return (
		<div className="relative flex h-24 w-24 items-center justify-center">
			{/* Кольца-эхо */}
			<span
				aria-hidden
				className="order-ring-echo absolute inset-0 rounded-full border border-[var(--success)]"
			/>
			<span
				aria-hidden
				className="order-ring-echo absolute inset-0 rounded-full border border-[var(--success)]"
				style={{ animationDelay: "0.8s" }}
			/>

			{/* Мягкое свечение */}
			<span
				aria-hidden
				className="absolute inset-0 rounded-full bg-[var(--success)]/12 blur-xl"
			/>

			<div className="order-check-container relative flex h-20 w-20 items-center justify-center rounded-full bg-[var(--success)]/10">
				<svg
					viewBox="0 0 60 60"
					className="h-full w-full"
					fill="none"
					role="img"
					aria-label="Заказ успешно оформлен"
				>
					<circle
						className="order-check-circle"
						cx="30"
						cy="30"
						r="26.5"
						stroke="var(--success)"
						strokeWidth="2.5"
					/>
					<path
						className="order-check-mark"
						d="M19 30.5 L26.5 38 L41 22"
						stroke="var(--success)"
						strokeWidth="3.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</div>
		</div>
	);
}
