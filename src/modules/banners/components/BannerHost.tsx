"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchNextBanner, requestImpression, sendBannerEvent } from "../api";
import { matchesClientContext } from "../conditions";
import { createScreenClock, startScreenTimer } from "../lib/screenTime";
import { electTabLeader } from "../lib/tabLeader";
import { SESSION_WARMUP_SECONDS } from "../policy";
import { bannersKeys } from "../queryKeys";
import type {
	BannerActionView,
	BannerView,
	NextBannerResponse,
} from "../types";
import { type BannerCloseCause, BannerModal } from "./BannerModal";

// Жизненный цикл баннера в браузере.
//
// ─── Что делает эта вкладка и чего не делает ───────────────────────────────
//
// Делает: выбирает момент (экранное время, нужная страница), спрашивает
// разрешения, показывает, замеряет длительность и сообщает о событиях.
//
// Не делает: не решает, кому баннер положен; не считает показы; не знает
// политику повторов; не держит очередь. Всё это — сервер, и именно поэтому
// закрытая вкладка ничего не теряет, а три открытые не утраивают показы.
//
// ─── Порядок событий одного показа ─────────────────────────────────────────
//
//   GET /next ──► ожидание экранного времени ──► проверка страницы
//                                                       │
//                       ┌───────────────────────────────┘
//                       ▼
//    POST impression (барьер) ──► «нельзя» ──► выбросить, не показывая
//                       │
//                    «можно»
//                       ▼
//                 открыть модалку ──► таймер «прочитал» ──► POST view
//                       │
//                       ├── нажали кнопку ──► POST cta ──► POST dismiss ──► переход
//                       └── закрыли      ──► POST dismiss ──► GET /next
//
// Барьер стоит ПЕРЕД открытием, а не после: между выдачей и показом проходит
// до нескольких минут, и всё это время администратор вправе снять баннер с
// публикации. Спросив после показа, мы бы узнали об этом у человека, который
// его уже прочитал.
//
// ─── Когда задаётся вопрос «есть ли баннер» ────────────────────────────────
//
// Только по поводам, и поводов ровно три: вкладка стала ведущей, модалка
// закрылась, сервер сам назвал момент (`retryAt`) или сообщил, что баннер ждёт
// другого экрана (`pageBlocked`). Ни одного интервала. Это прямое требование
// исходной системы, и HTTP его не отменяет: опрос «есть ли для меня баннер»
// каждые N секунд стоил бы прохода по всем баннерам на каждого посетителя ради
// события, которое случается несколько раз в жизни аккаунта.

type Pending = {
	banner: BannerView;
	impressionId: string;
	/** Сколько экранного времени вкладка набрала к моменту получения баннера. */
	receivedAtScreenSeconds: number;
};

type Active = {
	banner: BannerView;
	impressionId: string;
	/** Момент открытия модалки — начало отсчёта длительности просмотра. */
	openedAt: number;
};

const EMPTY: NextBannerResponse = {
	banner: null,
	impressionId: null,
	retryAt: null,
	pageBlocked: false,
};

/**
 * Модалка баннера и всё, что к ней ведёт.
 *
 * Монтируется в layout'е витрины и только для авторизованных: неавторизованные
 * баннеров не получают ни при каких условиях, и держать ради них вкладку в
 * выборах ведущего незачем.
 */
export function BannerHost() {
	const router = useRouter();
	const pathname = usePathname();
	const queryClient = useQueryClient();

	const [isLeader, setIsLeader] = useState(false);
	const [pending, setPending] = useState<Pending | null>(null);
	const [active, setActive] = useState<Active | null>(null);

	// Часы экранного времени вкладки. В `ref`, потому что это внешний ресурс с
	// собственным временем жизни, а не состояние рендера: их изменение не
	// должно ничего перерисовывать.
	const clock = useRef<ReturnType<typeof createScreenClock> | null>(null);
	// Путь в `ref` — чтобы запрос и таймеры, созданные один раз, читали
	// актуальный адрес, а не тот, что был при подписке. Синхронизируется
	// эффектом, а не присваиванием в теле: запись в `ref` во время рендера
	// ломает конкурентный рендеринг, где тело компонента могут выполнить и
	// выбросить.
	const pathRef = useRef(pathname);

	useEffect(() => {
		pathRef.current = pathname;
	}, [pathname]);

	useEffect(() => {
		clock.current = createScreenClock();
		return () => {
			clock.current?.stop();
			clock.current = null;
		};
	}, []);

	/* -------------------------------------------------- выборы ведущего --- */

	useEffect(() => electTabLeader(setIsLeader), []);

	/* ------------------------------------------------------- запрос ----- */

	const { data, refetch } = useQuery({
		queryKey: bannersKeys.next(),
		queryFn: () => fetchNextBanner(pathRef.current),
		// Спрашиваем, только когда есть что спрашивать: ведущая вкладка, на руках
		// ничего нет. Как только баннер получен, запрос отключается — сервер всё
		// равно ответит «в полёте», а лишний запрос стоит прохода по базе.
		enabled: isLeader && pending === null && active === null,
		// Ответ одноразовый (в нём выданный сервером `impressionId`), поэтому
		// свежим не бывает никогда: повторное включение обязано сходить на сервер.
		staleTime: 0,
		// Ни фокуса, ни реконнекта, ни интервала. Поводы перечислены в шапке, и
		// «пользователь вернулся на вкладку» среди них нет: он вернулся к тому,
		// что делал, а не к баннеру.
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: true,
		retry: false,
	});

	/**
	 * Забрать полученный баннер и очистить кэш запроса.
	 *
	 * Очистка обязательна: при следующем включении React Query сначала отдаёт
	 * то, что лежит в кэше, и без неё эффект ниже увидел бы ТОТ ЖЕ ответ второй
	 * раз — то есть показал бы уже показанный баннер ещё раз, с тем же
	 * `impressionId`, который сервер считает закрытым.
	 */
	const consume = useCallback(() => {
		queryClient.setQueryData(bannersKeys.next(), EMPTY);
	}, [queryClient]);

	useEffect(() => {
		if (!data?.banner || !data.impressionId) return;

		setPending({
			banner: data.banner,
			impressionId: data.impressionId,
			receivedAtScreenSeconds: clock.current?.elapsedSeconds() ?? 0,
		});
		consume();
	}, [data, consume]);

	/* ---------------------------------------------- отложенный вопрос --- */

	useEffect(() => {
		// Сервер сам назвал момент, когда возвращаться, — и только когда
		// возвращаться есть зачем: пауза между баннерами, суточный предел,
		// ожидание интервала повтора. Один таймер ровно на этот момент, а не
		// интервал.
		if (!isLeader || data?.banner || !data?.retryAt) return;

		const delay = Math.max(1_000, Date.parse(data.retryAt) - Date.now());
		const timer = setTimeout(() => void refetch(), delay);

		return () => clearTimeout(timer);
	}, [isLeader, data, refetch]);

	// Адрес, при котором был задан последний вопрос.
	//
	// ⚠ Без него эффект ниже зацикливается: в его зависимостях есть `data`, и
	// ответ «баннер ждёт другого экрана» сам является поводом к следующему
	// запросу, ответ на который — снова тот же самый. Сравнение с прошлым
	// адресом отсекает это в корне: повторный вопрос задаётся, только когда
	// человек ДЕЙСТВИТЕЛЬНО куда-то перешёл.
	const askedAtPath = useRef(pathname);

	useEffect(() => {
		if (askedAtPath.current === pathname) return;
		askedAtPath.current = pathname;

		// Переход по сайту — повод переспросить ровно тогда, когда сервер сказал,
		// что баннер ждёт другого экрана. В остальных случаях навигация ничего не
		// меняет, и запрос на каждый переход был бы опросом с другим поводом.
		if (!isLeader || !data?.pageBlocked || pending || active) return;

		void refetch();
	}, [pathname, isLeader, data, pending, active, refetch]);

	/* ------------------------------------------ ожидание и открытие ------ */

	// Какой показ уже отстоял своё экранное время. Хранится идентификатор, а не
	// булево: так значение само сбрасывается при следующем баннере, и не нужен
	// отдельный эффект, который бы его обнулял.
	const [readyImpressionId, setReadyImpressionId] = useState<string | null>(
		null,
	);

	useEffect(() => {
		if (!pending) return;

		// Прогрев сессии тратится один раз на вкладку: второй баннер в очереди не
		// должен ждать полторы минуты у человека, который на сайте уже час.
		const warmupLeft = Math.max(
			0,
			SESSION_WARMUP_SECONDS - pending.receivedAtScreenSeconds,
		);
		const wait = Math.max(pending.banner.delaySeconds, warmupLeft);
		const { impressionId } = pending;

		// Отсчёт НЕ ЗАВИСИТ ОТ НАВИГАЦИИ: он живёт в собственном эффекте, у
		// которого в зависимостях нет `pathname`. Иначе человек, листающий
		// каталог, не накапливал бы экранное время никогда и не увидел бы баннер
		// вовсе.
		return startScreenTimer(wait, () => setReadyImpressionId(impressionId));
	}, [pending]);

	useEffect(() => {
		if (!pending || active) return;
		if (readyImpressionId !== pending.impressionId) return;

		let cancelled = false;

		const open = async () => {
			// Страницу проверяем в момент открытия, а не в момент получения:
			// сервер решал по адресу, который знал минуту назад, а человек с тех
			// пор мог уйти. Не подошло — баннер ОСТАЁТСЯ ЖДАТЬ, а не
			// выбрасывается: эффект перезапустится вместе с `pathname`, когда
			// пользователь вернётся на нужный экран.
			if (
				!matchesClientContext(
					pending.banner.clientConditions,
					pending.banner.conditionMatch,
					{ path: pathname },
				)
			) {
				return;
			}

			const ack = await requestImpression(pending.impressionId, pathname);

			if (cancelled) return;

			if (ack.revoked) {
				// Баннер сняли с публикации или право на него исчезло, пока он ждал
				// своей очереди. Выбрасываем не показывая — ровно то, ради чего
				// барьер и стоит перед открытием, — и сразу спрашиваем следующий:
				// сервер уже освободил очередь.
				setPending(null);
				void refetch();
				return;
			}

			// Разрешения нет и отзыва нет — значит запрос не дошёл. Баннер
			// остаётся в ожидании: сервер состояния не двигал, и следующий отбор
			// вернёт его же.
			if (!ack.allowed) return;

			setActive({
				banner: pending.banner,
				impressionId: pending.impressionId,
				openedAt: Date.now(),
			});
			setPending(null);
		};

		void open();

		return () => {
			cancelled = true;
		};
	}, [pending, active, pathname, readyImpressionId, refetch]);

	/* ----------------------------------------------- порог «прочитал» ---- */

	useEffect(() => {
		if (!active) return;

		// Сообщаем ровно один раз, когда модалка провисела нужное время. Событие
		// нужно потому, что человек может прочитать баннер и уйти, не закрыв
		// окно, — и это успех показа, а не его отсутствие.
		return startScreenTimer(active.banner.dwellSeconds, () => {
			void sendBannerEvent({
				impressionId: active.impressionId,
				kind: "view",
				dwellMs: Date.now() - active.openedAt,
				path: pathRef.current,
			});
		});
	}, [active]);

	/* ------------------------------------------------------ действия ---- */

	const close = useCallback(
		(cause: BannerCloseCause) => {
			if (!active) return;

			const current = active;
			setActive(null);

			void sendBannerEvent({
				impressionId: current.impressionId,
				kind: "dismiss",
				closeMethod: cause,
				dwellMs: Date.now() - current.openedAt,
				path: pathRef.current,
				// Следующий баннер спрашиваем только после того, как сервер
				// зафиксировал закрытие: спросив раньше, мы бы гарантированно
				// получили «в полёте» и потратили запрос впустую.
			}).finally(() => void refetch());
		},
		[active, refetch],
	);

	const follow = useCallback(
		(kind: "cta" | "link", action: BannerActionView) => {
			if (!active) return;

			const current = active;
			const dwellMs = Date.now() - current.openedAt;

			setActive(null);

			// Переход и запись идут ПАРАЛЛЕЛЬНО ДРУГ ДРУГУ, но сами два события —
			// строго ПО ОЧЕРЕДИ.
			//
			// Навигацию запись не задерживает: ожидание ответа сервера перед
			// переходом стоило бы человеку заметной паузы после нажатия кнопки
			// ради строки в отчёте, а браузер доводит уже отправленный запрос и
			// после начала перехода.
			//
			// ⚠ А вот `cta` и `dismiss` отправлять одновременно НЕЛЬЗЯ, и это не
			// осторожность, а требование серверной логики: обработчик закрытия
			// перечитывает состояние, чтобы узнать, была ли нажата кнопка, — на
			// этом держится решение «цель достигнута». Отправленные разом, оба
			// запроса читают состояние до записи соседа, и тот, кто финиширует
			// вторым, затирает результат первого целиком (Payload обновляет
			// документ, а не отдельные поля). Наблюдалось ровно это: журнал
			// событий верный, а в состоянии `ctaClicks: 0` и баннер остался
			// активным — то есть человек нажал кнопку, а система решила, что нет,
			// и показала баннер снова.
			void sendBannerEvent({
				impressionId: current.impressionId,
				kind,
				dwellMs,
				href: action.href,
				path: pathRef.current,
			})
				.then(() =>
					// Закрытие фиксируется тем же событием, что и обычное, но с иным
					// поводом: переход по кнопке — не отказ, и попасть в статистику
					// закрытий он не должен.
					sendBannerEvent({
						impressionId: current.impressionId,
						kind: "dismiss",
						closeMethod: kind,
						dwellMs,
						path: pathRef.current,
					}),
				)
				.finally(() => void refetch());

			if (action.kind === "external") {
				window.open(action.href, "_blank", "noopener,noreferrer");
				return;
			}

			router.push(action.href);
		},
		[active, router, refetch],
	);

	if (!active) return null;

	return (
		<BannerModal
			banner={active.banner}
			onClose={close}
			onCta={(action) => follow("cta", action)}
			onLink={(action) => follow("link", action)}
		/>
	);
}
