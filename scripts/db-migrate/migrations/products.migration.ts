// scripts/db-migrate/migrations/products.migration.ts
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	resolveRef,
	resolveRefs,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyDiscount {
	isActive?: boolean;
	percentage?: number;
	amount?: number;
	validFrom?: Date;
	validUntil?: Date;
	minQuantity?: number;
}

interface LegacyInstruction {
	type?: "file" | "link";
	link?: string;
}

interface LegacySpecification {
	name: string;
	value: unknown;
	unit?: string;
	group?: string;
	isVisible?: boolean;
}

interface LegacyProduct {
	_id: ObjectId;
	sku: string;
	/** Старая схема — mongoose с { timestamps: true }. */
	createdAt?: Date;
	title: string;
	description: string;
	priceForIndividual: number;
	discount?: LegacyDiscount;
	status?: "available" | "unavailable" | "preorder" | "archived";
	minOrderQuantity?: number;
	maxOrderQuantity?: number;
	category: ObjectId;
	isVisible?: boolean;
	showOnMainPage?: boolean;
	instruction?: LegacyInstruction;
	specifications?: LegacySpecification[];
	upsellProducts?: Array<ObjectId>;
	weight?: number;
	dimensions?: { length?: number; width?: number; height?: number };
	manufacturer?: string;
	warrantyMonths?: number;
	metaTitle?: string;
	metaDescription?: string;
	keywords?: string[];
	publishedAt?: Date;
	viewsCount?: number;
	purchasesCount?: number;
}

// Прямых аналогов нет у: images/instruction.file (файлы вне области этой
// миграции), relatedProducts/crossSellProducts (в новой схеме есть только
// upsellProducts), customAttributes, rating, createdBy/updatedBy (staff не
// мигрируется).
const STATUS_MAP: Record<NonNullable<LegacyProduct["status"]>, string> = {
	available: "available",
	unavailable: "out_of_stock",
	preorder: "preorder",
	archived: "discontinued",
};

export default defineMigration({
	slug: "products",
	dependsOn: ["categories"],
	async run(ctx) {
		const { legacyDb, log } = ctx;
		const stats = emptyStats();

		const cursor = legacyDb
			.collection<LegacyProduct>(LEGACY_COLLECTIONS.products)
			.find({});

		// upsellProducts ссылается на products (self-reference) — на первом
		// проходе карта id самих products ещё не может быть полной, поэтому
		// связи проставляются вторым проходом (ниже), после того как все
		// товары уже существуют в новой БД.
		const pendingUpsell: Array<{
			legacyId: string;
			legacyUpsellIds: unknown[];
		}> = [];

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			const categoryId = await resolveRef(
				ctx,
				"categories",
				old.category?.toString(),
			);
			if (!categoryId) {
				stats.skipped++;
				log.warn(
					`Товар "${old.title}" (${legacyId}): категория не найдена, пропуск`,
				);
				continue;
			}

			const discountType = old.discount?.percentage ? "percentage" : "fixed";
			const discountValue =
				old.discount?.percentage ?? old.discount?.amount ?? 0;

			const result = await upsertByLegacyId({
				ctx,
				collection: "products",
				legacyId,
				data: {
					// Дата появления товара в СТАРОЙ системе.
					//
					// Каталог по умолчанию сортируется «Сначала новые» — это
					// `-createdAt` (см. SORT_OPTIONS в modules/productCatalog/lib/
					// catalogOptions.ts и buildCatalogSort в payload/services/
					// products.service.ts). Без переноса даты у всех перенесённых
					// товаров createdAt одинаковый (момент миграции), и порядок
					// каталога по умолчанию становится произвольным.
					//
					// В data, а не в createOnlyData: дату нужно починить и у уже
					// перенесённых товаров. Условный spread обязателен — передать
					// createdAt: undefined значит попросить Payload затереть дату.
					// updatedAt не переносим: Payload всё равно перезапишет его
					// своим now на каждом update (см. orders.migration.ts).
					...(old.createdAt
						? { createdAt: new Date(old.createdAt).toISOString() }
						: {}),
					title: old.title,
					description: old.description,
					category: categoryId,
					pricing: {
						priceForIndividual: old.priceForIndividual,
						discount: {
							isActive: old.discount?.isActive ?? false,
							type: discountType,
							value: discountValue,
							validFrom: old.discount?.validFrom
								? new Date(old.discount.validFrom).toISOString()
								: undefined,
							validUntil: old.discount?.validUntil
								? new Date(old.discount.validUntil).toISOString()
								: undefined,
							minQuantity: old.discount?.minQuantity ?? 1,
						},
					},
					inventory: {
						status: STATUS_MAP[old.status ?? "available"],
						minOrderQuantity: old.minOrderQuantity ?? 1,
						maxOrderQuantity: old.maxOrderQuantity,
						isVisible: old.isVisible ?? true,
						showOnMainPage: old.showOnMainPage ?? false,
					},
					instruction:
						old.instruction?.type === "link" && old.instruction.link
							? { type: "link", link: old.instruction.link }
							: undefined,
					specifications: (old.specifications ?? []).map((s) => ({
						name: s.name,
						value:
							s.value === undefined || s.value === null ? "" : String(s.value),
						unit: s.unit,
						group: s.group,
						isVisible: s.isVisible ?? true,
					})),
					brand: {
						manufacturer: old.manufacturer,
						warrantyMonths: old.warrantyMonths,
					},
					dimensions: {
						weight: old.weight,
						length: old.dimensions?.length,
						width: old.dimensions?.width,
						height: old.dimensions?.height,
					},
					seo: {
						metaTitle: old.metaTitle,
						metaDescription: old.metaDescription,
						keywords: (old.keywords ?? []).map((keyword) => ({ keyword })),
					},
					analytics: {
						viewsCount: old.viewsCount ?? 0,
						purchasesCount: old.purchasesCount ?? 0,
					},
					publishedAt: old.publishedAt
						? new Date(old.publishedAt).toISOString()
						: undefined,
				},
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(`Не удалось перенести товар "${old.title}" (${legacyId})`, {
					error:
						result.error instanceof Error
							? result.error.message
							: String(result.error),
				});
				continue;
			}

			stats[result.action]++;

			if (old.upsellProducts && old.upsellProducts.length > 0) {
				pendingUpsell.push({
					legacyId,
					legacyUpsellIds: old.upsellProducts,
				});
			}
		}

		// Второй проход: теперь все товары этого прогона существуют в новой БД,
		// карта legacyId -> id будет построена заново (полной) при первом
		// обращении ниже.
		for (const { legacyId, legacyUpsellIds } of pendingUpsell) {
			const newId = await resolveRef(ctx, "products", legacyId);
			if (!newId) continue; // товар не создался из-за ошибки выше — уже учтено в failed

			const { ids, unresolvedCount } = await resolveRefs(
				ctx,
				"products",
				legacyUpsellIds,
			);
			if (unresolvedCount > 0) {
				log.warn(
					`Товар ${legacyId}: ${unresolvedCount} связанных upsell-товаров не найдены (ещё не мигрированы или удалены)`,
				);
			}
			if (ids.length === 0) continue;

			if (ctx.dryRun) continue;
			await ctx.payload.update({
				collection: "products",
				id: newId as number,
				data: { relations: { upsellProducts: ids as number[] } },
				overrideAccess: true,
			});
		}

		return stats;
	},
});
