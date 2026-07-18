import type { ProductAvailabilityStatus } from "@/modules/productCard";

export interface ProductDetailImage {
	url: string;
	alt: string;
}

export interface ProductSpecificationItem {
	id: string;
	name: string;
	value: string;
	unit: string | null;
	group: string | null;
}
export interface ProductUpsellRef {
	id: string;
}

export interface ProductInstructionData {
	type: "file" | "link";
	fileUrl: string | null;
	fileName: string | null;
	linkUrl: string | null;
}

export interface ProductBrandInfo {
	manufacturer: string | null;
	warrantyMonths: number | null;
}

export interface ProductDimensionsInfo {
	weight: number | null;
	length: number | null;
	width: number | null;
	height: number | null;
}

export interface ProductDetailCategory {
	id: string;
	slug: string;
	title: string;
}

export interface ProductDetailData {
	id: string;
	title: string;
	slug: string;
	description: string;
	category: ProductDetailCategory | null;
	images: ProductDetailImage[];
	priceForIndividual: number;
	finalPrice: number;
	hasDiscount: boolean;
	discountPercentage: number | null;
	status: ProductAvailabilityStatus;
	minOrderQuantity: number;
	maxOrderQuantity: number;
	specifications: ProductSpecificationItem[];
	brand: ProductBrandInfo;
	dimensions: ProductDimensionsInfo;
	instruction: ProductInstructionData | null;
	upsellProducts: ProductUpsellRef[];
}
