import { unstable_cache } from "next/cache";
import { env } from "@/env";
import { getDocumentLinks } from "@/modules/home/lib/documents";
import { getPayloadInstance } from "./getPayload";
import {
	getCachedProducts,
	mapProductsToCardsWithRating,
} from "./products.service";

async function fetchProductIds() {
	const payload = await getPayloadInstance();
	const selection = await payload.findGlobal({
		slug: "security-solutions",
		depth: 0,
	});
	return [
		...new Set(
			(selection?.products ?? []).map((product) =>
				String(typeof product === "number" ? product : product.id),
			),
		),
	];
}

const getCachedProductIds = unstable_cache(
	fetchProductIds,
	["security-solutions"],
	{
		tags: ["security-solutions"],
		revalidate: false,
	},
);

export async function getSecuritySolutionSelection() {
	const ids =
		env.NODE_ENV === "development"
			? await fetchProductIds()
			: await getCachedProductIds();
	if (ids.length === 0) return { products: [], instructions: [] };

	const { docs } = await getCachedProducts({
		ids,
		isVisible: true,
		limit: ids.length,
	});
	const byId = new Map(docs.map((product) => [String(product.id), product]));
	const ordered = ids.flatMap((id) => {
		const product = byId.get(id);
		return product ? [product] : [];
	});
	const instructions = getDocumentLinks(
		ordered.flatMap(({ id, title, instruction }) => {
			if (!instruction?.type) return [];
			return [
				{
					id: `product-instruction-${id}`,
					title: `Инструкция · ${title}`,
					sourceType: instruction.type === "file" ? "file" : "url",
					file: instruction.file,
					url: instruction.link,
				},
			];
		}),
	);
	return { products: mapProductsToCardsWithRating(ordered), instructions };
}
