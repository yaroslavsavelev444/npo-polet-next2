import type { AccessResult, CollectionConfig, Where } from "payload";
import { getProductHrefFromDoc } from "../../modules/productCard/lib/routing.ts";
import { notify } from "../../services/notifications/notificationCenter.ts";
import { notifyReviewStatusChanged } from "../../services/notifications/notifyReviewStatusChanged.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { isStaffUser } from "../access/ownership.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

// Средний рейтинг и количество отзывов показываются на карточках каталога,
// а он кэшируется с тегом "products" (см. products.service.ts). Одобрение или
// удаление отзыва меняет агрегат — без сброса тега карточки показывали бы
// старый рейтинг до следующего изменения самого товара.
const revalidateProducts = createRevalidateCacheHook("products");

export const ProductReviews: CollectionConfig = {
	slug: "product-reviews",

	admin: {
		useAsTitle: "title",
		group: "Магазин",
		defaultColumns: ["product", "user", "rating", "status", "createdAt"],
	},

	access: {
		// Публично видны только прошедшие модерацию отзывы. Раньше стояло
		// `() => true`, и анонимный GET /api/product-reviews отдавал вообще всё,
		// включая ещё не проверенные и отклонённые отзывы вместе с причиной
		// отклонения (rejectionReason) и связью с автором. Витрина этим гейтом
		// не пользуется — все её выборки идут через reviews.service.ts с
		// overrideAccess: true и собственным фильтром по статусу.
		read: ({ req }): AccessResult => {
			if (isStaffUser(req.user)) return true;
			// Автор дополнительно видит свой отзыв в любом статусе — иначе он
			// не может убедиться, что отзыв принят на модерацию.
			if (req.user?.collection === "users") {
				const where: Where = {
					or: [
						{ status: { equals: "approved" } },
						{ user: { equals: req.user.id } },
					],
				};
				return where;
			}
			const approvedOnly: Where = { status: { equals: "approved" } };
			return approvedOnly;
		},

		// Создание закрыто для любого клиента REST/GraphQL. Единственный
		// легитимный путь — submitReviewAction (см. modules/reviews), который
		// вызывает payload.create с overrideAccess: true и потому этот гейт не
		// проходит вовсе; там же проверяются авторство, факт покупки
		// (delivered-заказ), отсутствие дубля и rate limit.
		//
		// Раньше здесь было `!!req.user` без единого field-level access на
		// user/status/isVerifiedPurchase — то есть любой вошедший покупатель
		// мог отправить POST /api/product-reviews с чужим `user`, статусом
		// `approved` и `isVerifiedPurchase: true`, опубликовав от чужого имени
		// произвольный текст мимо модерации и мимо требования покупки.
		create: () => false,

		update: isAdminOrSuperAdmin,

		delete: isAdminOrSuperAdmin,
	},

	timestamps: true,

	hooks: {
		beforeValidate: [
			async ({ data, req, operation }) => {
				if (operation !== "create" || !data?.user || !data?.product) {
					return data;
				}

				const existing = await req.payload.find({
					collection: "product-reviews",
					where: {
						and: [
							{
								user: {
									equals: data.user,
								},
							},
							{
								product: {
									equals: data.product,
								},
							},
						],
					},
					limit: 1,
				});

				if (existing.docs.length) {
					throw new Error("Отзыв для данного товара уже существует");
				}

				return data;
			},
		],
		afterChange: [
			async ({ doc, previousDoc, operation, req }) => {
				if (operation === "update" && previousDoc?.status !== doc.status) {
					const populated = await req.payload.findByID({
						collection: "product-reviews",
						id: doc.id,
						depth: 2,
						overrideAccess: true,
					});
					void notifyReviewStatusChanged(populated);

					if (
						populated.status === "approved" ||
						populated.status === "rejected"
					) {
						const user = populated.user;
						const product = populated.product;
						if (typeof user === "object" && typeof product === "object") {
							const productUrl = getProductHrefFromDoc(product);
							void notify(
								req.payload,
								user.id,
								populated.status === "approved"
									? "review_approved"
									: "review_rejected",
								{
									productTitle: product.title,
									productUrl,
									...(populated.status === "rejected" && {
										reason: populated.rejectionReason,
									}),
								},
							);
						}
					}
				}

				// Изменение статуса (в т.ч. переход в/из "approved") меняет агрегат
				// рейтинга на карточках — сбрасываем кэш каталога.
				if (operation === "create" || previousDoc?.status !== doc.status) {
					revalidateProducts();
				}
				return doc;
			},
		],
		afterDelete: [
			() => {
				revalidateProducts();
			},
		],
	},

	fields: [
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
		},

		{
			name: "product",
			type: "relationship",
			relationTo: "products",
			required: true,
			index: true,
		},

		{
			name: "rating",
			type: "number",
			required: true,
			min: 1,
			max: 5,
		},

		{
			name: "title",
			type: "text",
			maxLength: 200,
		},

		{
			name: "comment",
			type: "textarea",
			required: true,
		},

		{
			name: "pros",
			type: "array",
			fields: [
				{
					name: "value",
					type: "text",
				},
			],
		},

		{
			name: "cons",
			type: "array",
			fields: [
				{
					name: "value",
					type: "text",
				},
			],
		},

		{
			name: "status",
			type: "select",
			defaultValue: "pending",
			options: ["pending", "approved", "rejected"],
			index: true,
		},

		{
			name: "rejectionReason",
			type: "textarea",
			admin: {
				condition: (_, siblingData) => siblingData?.status === "rejected",
			},
		},

		{
			name: "isVerifiedPurchase",
			type: "checkbox",
			defaultValue: false,
		},

		{
			name: "helpfulCount",
			type: "number",
			defaultValue: 0,
			admin: {
				readOnly: true,
			},
		},

		{
			name: "notHelpfulCount",
			type: "number",
			defaultValue: 0,
			admin: {
				readOnly: true,
			},
		},
	],
};
