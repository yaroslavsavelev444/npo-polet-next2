import { Headset } from "lucide-react";
import type { ReactNode } from "react";
import { formatPrice } from "@/modules/productCard";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { PageContainer } from "@/shared/components/PageContainer";
import { formatOrderDateTime } from "../../lib/format-date";
import {
	DELIVERY_METHOD_LABELS,
	PAYMENT_METHOD_LABELS,
	PAYMENT_STATUS_LABELS,
} from "../../lib/labels";
import { ORDER_STATUS_VIEW } from "../../lib/status-view";
import type { OrderDetailView } from "../../types";
import { OrderStatusBadge } from "../OrderStatusBadge";
import styles from "../Orders.module.css";
import { OrderCelebration } from "./OrderCelebration";
import { OrderStatusMark } from "./OrderStatusMark";

interface Props {
	order: OrderDetailView;
	/** Цепочка навигации, отрисованная на сервере. */
	breadcrumbs: ReactNode;
}

/**
 * Первый экран страницы заказа.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * НА КАКОЙ ВОПРОС ОН ОТВЕЧАЕТ
 * ════════════════════════════════════════════════════════════════════════════
 * Человек, только что нажавший «Подтвердить заказ», задаёт ровно один вопрос:
 * «заказ действительно оформлен?». Человек, пришедший сюда через месяц из
 * «Моих заказов», — другой: «что с моим заказом сейчас?». Экран отвечает обоим
 * одним и тем же способом, потому что ответ на оба вопроса — это статус:
 *
 *   знак состояния → утверждение о заказе → номер → статус и дата → сумма
 *
 * Заголовок берётся из статуса (ORDER_STATUS_VIEW.headline), а не прибит к
 * слову «оформлен». Прежняя версия писала «Заказ оформлен» всегда — в том
 * числе над отменённым заказом, открытым из списка.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ПОЧЕМУ СУММА ЗДЕСЬ, А НЕ ТОЛЬКО В РАСЧЁТЕ
 * ════════════════════════════════════════════════════════════════════════════
 * «Сколько я заплачу» — второй по важности вопрос после «оформлен ли», и
 * отвечать на него прокруткой на два экрана вниз нельзя. Внизу страницы стоит
 * не повтор, а РАЗБОР: из чего сумма сложилась. Это разные ответы на разные
 * вопросы — так же, как на оформлении заказа итог в полосе и разбор в панели.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ТИПОГРАФИКА
 * ════════════════════════════════════════════════════════════════════════════
 * Заголовок — акцидентная PaluiSP2 в верхнем регистре (.u-display): это
 * единственное место страницы, где уместен display-кегль, и ровно тот жанр,
 * ради которого гарнитуру и держат. Кегль подобран по самому длинному слову
 * из возможных заголовков — «ПОДТВЕРЖДЁН», 11 знаков, ~13.2em: при нижней
 * границе 1.5rem это 317px на экране 375px, где доступно 343. На 320px слово
 * уходит в словарный перенос — там это неизбежно при любом читаемом кегле.
 *
 * Номер заказа — моноширинный и крупный: это код, который диктуют менеджеру,
 * и главная причина вернуться на страницу.
 */
export function OrderPageHero({ order, breadcrumbs }: Props) {
	const view = ORDER_STATUS_VIEW[order.status];
	// Обещание звонка живёт ровно столько, сколько остаётся правдой. Над
	// доставленным или отменённым заказом «менеджер свяжется с вами» — это
	// обещание, которого никто не давал.
	const showCallPromise = view.tone === "wait" && Boolean(order.contact.phone);

	// Подпись к сумме обязана говорить правду о ней. «К оплате» над отменённым
	// заказом обещает платёж, которого не будет, а над оплаченным — платёж,
	// который уже состоялся. Сама сумма показывается во всех трёх случаях: это
	// стоимость заказа, и её проверяют независимо от того, чем он кончился.
	const totalLabel =
		view.tone === "stopped"
			? "сумма заказа"
			: order.payment.status === "paid"
				? "оплачено"
				: "к оплате";

	return (
		<section
			className={styles.pageHero}
			data-tone={view.tone}
			style={{
				// Шапка сайта — position: fixed, её место в потоке держит
				// HeaderSpacer. Первый экран заезжает ПОД неё, поэтому спейсер
				// компенсируется отрицательным полем, а содержимое возвращается
				// вниз таким же паддингом.
				marginTop: "calc(-1 * var(--sticky-header-height))",
				paddingTop: "var(--sticky-header-height)",
			}}
		>
			{/* Конфетти лежит под содержимым и взлетает только в тот переход,
			    который пришёл прямо с оформления. */}
			<OrderCelebration orderNumber={order.orderNumber} />

			<span aria-hidden className={styles.pageHeroGlow} />
			<span aria-hidden className={styles.pageHeroSeam} />

			<PageContainer className={styles.pageHeroInner}>
				{breadcrumbs}

				<div className={styles.heroBody}>
					<OrderStatusMark status={order.status} />

					<h1 className={`u-display ${styles.heroTitle}`}>{view.headline}</h1>

					{/* Текст ровно «Заказ №XXX» одним элементом: его диктуют, его
					    ищут глазами и по нему же страницу узнают в поиске. */}
					<p className={styles.heroNumber}>
						<span className={styles.heroNumberPrefix}>Заказ №</span>
						{order.orderNumber}
					</p>

					<div className={styles.heroMeta}>
						<OrderStatusBadge status={order.status} />
						<time dateTime={order.createdAt} className={catalog.micro}>
							от {formatOrderDateTime(order.createdAt)}
						</time>
					</div>

					<p className={styles.heroTotal}>
						<span className={catalog.micro}>{totalLabel}</span>
						<span className={styles.heroTotalValue}>
							{formatPrice(order.pricing.total)}
						</span>
					</p>

					{showCallPromise && (
						// Номер — тот самый, который покупатель выбрал в форме.
						// Формулировка меняется вместе с выбором: обещать «свяжется с
						// вами», когда звонок уйдёт получателю, значит спутать двух
						// разных людей.
						<p className={styles.heroPromise}>
							<Headset
								size={15}
								aria-hidden
								className={styles.heroPromiseIcon}
							/>
							<span>
								{order.contact.owner === "recipient"
									? "В ближайшее время менеджер позвонит получателю по номеру "
									: "В ближайшее время менеджер свяжется с вами по номеру "}
								<a
									href={`tel:${order.contact.phone.replace(/[^\d+]/g, "")}`}
									className={styles.fieldLink}
								>
									{order.contact.phone}
								</a>
								, чтобы уточнить детали и подтвердить заказ.
							</span>
						</p>
					)}
				</div>

				{/* Три факта, которые отвечают на «что именно я заказал» без
				    прокрутки: сколько всего, как получу, чем плачу. Ниже они
				    раскрыты подробно — здесь это оглавление, а не повтор: одной
				    строкой вместо трёх блоков. */}
				<dl className={styles.heroFacts}>
					<div className={styles.heroFact}>
						<dt className={catalog.micro}>состав</dt>
						<dd className={styles.heroFactValue}>
							{order.itemsCount} {pluralPositions(order.itemsCount)}
							<span className={styles.heroFactMuted}>
								{order.totalItems} шт.
							</span>
						</dd>
					</div>

					<div className={styles.heroFact}>
						<dt className={catalog.micro}>получение</dt>
						<dd className={styles.heroFactValue}>
							{DELIVERY_METHOD_LABELS[order.delivery.method]}
						</dd>
					</div>

					<div className={styles.heroFact}>
						<dt className={catalog.micro}>оплата</dt>
						<dd className={styles.heroFactValue}>
							{PAYMENT_METHOD_LABELS[order.payment.method]}
							<span className={styles.heroFactMuted}>
								{PAYMENT_STATUS_LABELS[order.payment.status]}
							</span>
						</dd>
					</div>
				</dl>
			</PageContainer>
		</section>
	);
}

/** Склонение «позиция / позиции / позиций». */
function pluralPositions(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "позиция";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
		return "позиции";
	return "позиций";
}
