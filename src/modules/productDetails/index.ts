export { ProductGallery } from "./components/gallery/ProductGallery";
export { ProductDetailTabs } from "./components/ProductDetailTabs";
export { ProductHeader } from "./components/ProductHeader";
export { ProductRelated } from "./components/ProductRelated";
export { ProductStickyBar } from "./components/ProductStickyBar";

export { mapProductToDetailData } from "./lib/adapter";
export { getRelatedProducts } from "./lib/get-related-products";

export type {
	ProductDetailData,
	ProductInstructionData,
	ProductSpecificationItem,
} from "./types";
