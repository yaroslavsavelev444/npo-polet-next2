import type {
	AnalyticsOrderStatus,
	CompareMode,
	CustomerType,
	Granularity,
} from "./constants.ts";
import type { DateRange } from "./query.ts";

/** Ответы эндпоинта /api/orders/analytics — по одному на раздел страницы. */

export interface PeriodInfo {
	from: string;
	to: string;
	days: number;
	compareMode: CompareMode;
	compare: DateRange | null;
	granularity: Granularity;
	timezone: string;
}

export interface Totals {
	/** Все оформленные заказы, включая отменённые. */
	placed: number;
	/** Действующие заказы — база продаж и выручки. */
	orders: number;
	cancelled: number;
	refunded: number;
	/** Сумма pricing.total действующих заказов. */
	revenue: number;
	avgCheck: number | null;
	medianCheck: number | null;
	/** Сумма отменённых и возвращённых заказов. */
	lostRevenue: number;
	voidRate: number | null;
	delivered: number;
	deliveredRevenue: number;
	open: number;
	openRevenue: number;
	paid: number;
	paidRevenue: number;
	/** Проданные единицы товара (сумма quantity), не заказы и не позиции. */
	units: number;
	/** Строки заказов. */
	positions: number;
	/** Сумма позиций: после скидки товара, до скидки корзины и промокода. */
	itemRevenue: number;
	unitsPerOrder: number | null;
	positionsPerOrder: number | null;
	avgUnitPrice: number | null;
	customers: number;
	revenuePerCustomer: number | null;
	subtotal: number;
	discount: number;
	discountRate: number | null;
	shipping: number;
}

export interface SeriesPoint {
	start: string;
	end: string;
	/** Шаг графика вышел за границы периода: неделя или месяц неполные. */
	partial: boolean;
	placed: number;
	orders: number;
	revenue: number;
	units: number;
	avgCheck: number | null;
}

export interface MixRow {
	key: string;
	orders: number;
	revenue: number;
}

export interface StatusRow {
	status: AnalyticsOrderStatus;
	orders: number;
	amount: number;
}

export interface PromoRow {
	code: string;
	orders: number;
	revenue: number;
	discount: number;
}

export interface OverviewDTO {
	section: "overview";
	period: PeriodInfo;
	current: Totals;
	previous: Totals | null;
	series: SeriesPoint[];
	previousSeries: SeriesPoint[] | null;
	statuses: StatusRow[];
	delivery: MixRow[];
	payment: MixRow[];
	paymentStatus: MixRow[];
	source: MixRow[];
	promo: {
		orders: number;
		revenue: number;
		discount: number;
		top: PromoRow[];
	};
	/** Действующие заказы: [день недели пн..вс][час 0..23]. */
	heatmap: number[][];
}

export interface ProductRow {
	productId: number;
	title: string;
	categoryId: number | null;
	category: string | null;
	inventoryStatus: string | null;
	units: number;
	revenue: number;
	orders: number;
	customers: number;
	avgPrice: number | null;
	share: number | null;
	abc: "A" | "B" | "C";
	voidUnits: number;
	prevUnits: number | null;
	prevRevenue: number | null;
}

export interface DemandRow {
	key: string;
	label: string;
	id: number | null;
	products: number;
	units: number;
	revenue: number;
	orders: number;
	customers: number;
	prevRevenue: number | null;
}

export interface BandRow {
	key: string;
	label: string;
	orders: number;
	units: number;
	revenue: number;
}

export interface PairRow {
	a: string;
	b: string;
	orders: number;
}

export interface InterestRow {
	productId: number;
	title: string;
	views: number;
	purchases: number;
	wishlists: number;
	restock: number;
}

export interface ZeroSalesRow {
	productId: number;
	title: string;
	category: string | null;
	views: number;
}

export interface ProductsDTO {
	section: "products";
	period: PeriodInfo;
	summary: {
		soldProducts: number;
		units: number;
		revenue: number;
		orderDiscounts: number;
		orderRevenue: number;
		activeCatalog: number;
		zeroSales: number;
		top10Share: number | null;
		abc: Record<"A" | "B" | "C", { products: number; revenue: number }>;
		prevUnits: number | null;
		prevRevenue: number | null;
		prevSoldProducts: number | null;
	};
	topByRevenue: ProductRow[];
	topByUnits: ProductRow[];
	lowDemand: ProductRow[];
	zeroSales: ZeroSalesRow[];
	categories: DemandRow[];
	manufacturers: DemandRow[];
	priceBands: BandRow[];
	basketSizes: BandRow[];
	pairs: PairRow[];
	interest: InterestRow[];
}

/** Таблица товаров: отдельный запрос, чтобы страницы не пересчитывали весь раздел. */
export interface ProductTableDTO {
	section: "product_table";
	period: PeriodInfo;
	ranking: {
		rows: ProductRow[];
		total: number;
		page: number;
		pageSize: number;
	};
}

export interface GeoRow {
	key: string;
	label: string;
	orders: number;
	placed: number;
	revenue: number;
	customers: number;
	avgCheck: number | null;
	prevOrders: number | null;
	prevRevenue: number | null;
}

export interface GeoDTO {
	section: "geo";
	period: PeriodInfo;
	totals: { orders: number; revenue: number };
	coverage: {
		withRegion: number;
		pickup: number;
		unknownRegion: number;
		withCity: number;
	};
	leaders: {
		byOrders: GeoRow | null;
		byRevenue: GeoRow | null;
		fastestGrowth: GeoRow | null;
	};
	regions: { rows: GeoRow[]; total: number };
	cities: { rows: GeoRow[]; total: number };
	pickupPoints: GeoRow[];
}

export interface CustomerTypeRow {
	type: CustomerType;
	customers: number;
	orders: number;
	revenue: number;
	avgCheck: number | null;
}

export interface CustomerTotals {
	customers: number;
	newCustomers: number;
	returningCustomers: number;
	/** ≥ 2 действующих заказа за всю историю к концу периода. */
	repeatCustomers: number;
	repeatRate: number | null;
	/** ≥ 2 действующих заказа внутри периода. */
	repeatWithinPeriod: number;
	firstOrders: number;
	repeatOrders: number;
	repeatOrderShare: number | null;
	firstOrderRevenue: number;
	repeatOrderRevenue: number;
	ordersPerCustomer: number | null;
	revenuePerCustomer: number | null;
	medianDaysBetweenOrders: number | null;
	daysBetweenSample: number;
	/** Заказы без покупателя: обезличены или перенесены без владельца. */
	unattributedOrders: number;
	unattributedRevenue: number;
}

export interface CohortRow {
	cohort: string;
	size: number;
	/** Доля вернувшихся по смещению в месяцах; null — месяц ещё не наступил. */
	retention: (number | null)[];
}

export interface TopCustomerRow {
	userId: number;
	name: string;
	company: string | null;
	type: CustomerType;
	orders: number;
	revenue: number;
	lastOrderAt: string;
	lifetimeOrders: number;
}

export interface CustomersDTO {
	section: "customers";
	period: PeriodInfo;
	current: CustomerTotals;
	previous: CustomerTotals | null;
	types: CustomerTypeRow[];
	mixedTypeCustomers: number;
	frequency: { key: string; customers: number; revenue: number }[];
	series: { start: string; firstOrders: number; repeatOrders: number }[];
	cohorts: { maxOffset: number; rows: CohortRow[] };
	recency: { key: string; customers: number }[];
	topCustomers: TopCustomerRow[];
}

export interface FunnelStageRow {
	key: string;
	label: string;
	reached: number;
	reachedAmount: number;
	/** Заказы, которые сейчас стоят на этом этапе. */
	active: number;
	/** Отменены и возвращены; последний зафиксированный этап — этот. */
	lost: number;
	lostAmount: number;
	conversionToNext: number | null;
	/** Конверсия без учёта заказов, которые ещё стоят на этапе. */
	closedConversionToNext: number | null;
}

export interface VoidSliceRow {
	dimension: "delivery" | "payment" | "customerType";
	key: string;
	placed: number;
	voided: number;
	rate: number | null;
}

export interface FunnelDTO {
	section: "funnel";
	period: PeriodInfo;
	placed: number;
	stages: FunnelStageRow[];
	biggestLossStage: string | null;
	biggestQueueStage: string | null;
	historyCoverage: {
		/** У заказа в истории есть хотя бы одна запись после оформления. */
		withTransitions: number;
		total: number;
	};
	stageTiming: {
		key: string;
		label: string;
		medianHours: number | null;
		sample: number;
	}[];
	void: {
		cancelled: number;
		refunded: number;
		cancelledAmount: number;
		refundedAmount: number;
		rate: number | null;
		previousRate: number | null;
		reasons: { reason: string; orders: number }[];
		slices: VoidSliceRow[];
	};
	payment: {
		method: string;
		orders: number;
		invoiceAttached: number;
		paid: number;
		paidRate: number | null;
		medianDaysToPay: number | null;
		daysToPaySample: number;
	}[];
	/** Снимок на сейчас: не зависит от выбранного периода. */
	openNow: {
		total: number;
		amount: number;
		aging: { key: string; orders: number; amount: number }[];
		oldest: {
			id: number;
			orderNumber: string;
			status: AnalyticsOrderStatus;
			ageDays: number;
			total: number;
		}[];
	};
	carts: {
		nonEmpty: number;
		units: number;
		aging: { key: string; carts: number }[];
	};
}

export interface MetaDTO {
	section: "meta";
	firstOrderDate: string | null;
	lastOrderDate: string | null;
	totalOrders: number;
	categories: { id: number; label: string }[];
	regions: { key: string; label: string; orders: number }[];
}

export type AnalyticsResponse =
	| MetaDTO
	| OverviewDTO
	| ProductsDTO
	| ProductTableDTO
	| GeoDTO
	| CustomersDTO
	| FunnelDTO;
