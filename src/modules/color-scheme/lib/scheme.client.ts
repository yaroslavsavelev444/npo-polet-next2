import {
	parseSchemePreference,
	SCHEME_COOKIE,
	type Scheme,
	type SchemePreference,
} from "./scheme";

/**
 * Клиентская половина темы: прочитать выбор, применить его, подписаться на
 * изменения.
 *
 * Источник правды — атрибут data-scheme на <html>, а не состояние React.
 * Переключатель в шапке и выбор в подвале/меню живут в разных деревьях, и
 * атрибут — единственное, что они оба видят без провайдера поверх всего
 * приложения. Подписка — MutationObserver на этот атрибут (см. subscribe).
 */

const YEAR_SECONDS = 60 * 60 * 24 * 365;
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function readSchemePreference(): SchemePreference {
	return parseSchemePreference(document.documentElement.dataset.scheme);
}

export function resolveScheme(preference: SchemePreference): Scheme {
	if (preference !== "auto") return preference;
	return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/**
 * Подписка на смену выбора и на смену темы системы — второе нужно подписи
 * переключателя в режиме «Авто».
 */
export function subscribeToScheme(onChange: () => void): () => void {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["data-scheme"],
	});
	const media = window.matchMedia(DARK_QUERY);
	media.addEventListener("change", onChange);
	return () => {
		observer.disconnect();
		media.removeEventListener("change", onChange);
	};
}

function commit(preference: SchemePreference) {
	const root = document.documentElement;
	if (preference === "auto") {
		delete root.dataset.scheme;
		document.cookie = `${SCHEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
	} else {
		root.dataset.scheme = preference;
		document.cookie = `${SCHEME_COOKIE}=${preference}; path=/; max-age=${YEAR_SECONDS}; samesite=lax`;
	}
}

let running: ViewTransition | null = null;

/**
 * Применяет выбор.
 *
 * Если видимая тема действительно меняется, новая проявляется кругом от
 * элемента, который её включил, — жест привязан к источнику и читается как
 * раскрывающаяся сеть, а не как вспышка всей страницы. Круг — clip-path
 * на снимке новой страницы (View Transitions), то есть одна композиторная
 * анимация без перерисовки содержимого.
 *
 * Повторное нажатие посреди перехода не ждёт его конца: текущий переход
 * досрочно завершается, новый стартует сразу.
 *
 * При «уменьшить движение» круга нет — остаётся штатный переход браузера,
 * короткое растворение: резкий скачок яркости всей страницы неприятен так
 * же, как лишнее движение. Без поддержки View Transitions тема просто
 * меняется.
 */
export function applySchemePreference(
	preference: SchemePreference,
	origin?: HTMLElement | null,
) {
	const from = resolveScheme(readSchemePreference());
	const to = resolveScheme(preference);

	if (from === to || typeof document.startViewTransition !== "function") {
		commit(preference);
		return;
	}

	running?.skipTransition();

	const root = document.documentElement;
	const reduceMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	const reveal = Boolean(origin) && !reduceMotion;

	if (reveal) root.dataset.schemeTransition = "reveal";

	const transition = document.startViewTransition(() => commit(preference));
	running = transition;

	if (reveal && origin) {
		const rect = origin.getBoundingClientRect();
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		const radius = Math.hypot(
			Math.max(x, window.innerWidth - x),
			Math.max(y, window.innerHeight - y),
		);

		transition.ready
			.then(() => {
				root.animate(
					{
						clipPath: [
							`circle(0px at ${x}px ${y}px)`,
							`circle(${radius}px at ${x}px ${y}px)`,
						],
					},
					{
						duration: 640,
						easing: "cubic-bezier(0.16, 1, 0.3, 1)",
						pseudoElement: "::view-transition-new(root)",
					},
				);
			})
			.catch(() => {});
	}

	transition.finished.finally(() => {
		if (running !== transition) return;
		running = null;
		delete root.dataset.schemeTransition;
	});
}
