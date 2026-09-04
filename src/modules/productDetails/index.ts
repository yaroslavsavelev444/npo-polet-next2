export { ProductGallery } from "./components/gallery/ProductGallery";
export { ProductBuyPanel } from "./components/ProductBuyPanel";
export { ProductInformation } from "./components/ProductInformation";
export { ProductPageHeader } from "./components/ProductPageHeader";
export { ProductRelated } from "./components/ProductRelated";
export { ProductStickyBar } from "./components/ProductStickyBar";

export { mapProductToDetailData } from "./lib/adapter";
export { getRelatedProducts } from "./lib/get-related-products";

export type {
	ProductDetailData,
	ProductInstructionData,
	ProductSpecificationItem,
} from "./types";
