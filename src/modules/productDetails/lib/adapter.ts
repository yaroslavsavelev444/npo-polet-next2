import type { ProductAvailabilityStatus } from "@/modules/productCard";
import {
  calculatePriceBreakdown,
  mapDiscountPercentage,
} from "@/modules/productCard";
import type { Category, Media, Product } from "@/payload-types";
import type {
  ProductBrandInfo,
  ProductDetailCategory,
  ProductDetailData,
  ProductDetailImage,
  ProductDimensionsInfo,
  ProductInstructionData,
  ProductSpecificationItem,
} from "../types";

function isPopulatedMedia(
  value: number | Media | null | undefined,
): value is Media {
  return typeof value === "object" && value !== null;
}

function isPopulatedCategory(
  value: number | Category | null | undefined,
): value is Category {
  return typeof value === "object" && value !== null;
}

function mapImages(images: Product["images"]): ProductDetailImage[] {
  if (!images || images.length === 0) return [];
  return images.filter(isPopulatedMedia).map((media) => ({
    url: media.url ?? "",
    alt: media.alt || "",
  }));
}

function mapSpecifications(
  specifications: Product["specifications"],
): ProductSpecificationItem[] {
  if (!specifications) return [];
  return specifications
    .filter((spec) => spec.isVisible !== false)
    .map((spec, index) => ({
      id: spec.id ?? String(index),
      name: spec.name,
      value: spec.value,
      unit: spec.unit ?? null,
      group: spec.group ?? null,
    }));
}

function mapInstruction(
  instruction: Product["instruction"],
): ProductInstructionData | null {
  if (!instruction?.type) return null;

  if (instruction.type === "file") {
    const file = isPopulatedMedia(instruction.file) ? instruction.file : null;
    if (!file?.url) return null;
    return {
      type: "file",
      fileUrl: file.url,
      fileName: file.filename ?? null,
      linkUrl: null,
    };
  }

  if (instruction.type === "link" && instruction.link) {
    return {
      type: "link",
      fileUrl: null,
      fileName: null,
      linkUrl: instruction.link,
    };
  }

  return null;
}

function mapStatus(
  status: NonNullable<Product["inventory"]>["status"],
): ProductAvailabilityStatus {
  switch (status) {
    case "available":
    case "preorder":
    case "out_of_stock":
    case "discontinued":
      return status;
    default:
      return "available";
  }
}

function mapCategory(
  category: Product["category"],
): ProductDetailCategory | null {
  if (!isPopulatedCategory(category)) return null;
  return {
    id: String(category.id),
    slug: category.slug ?? "",
    title: category.name,
  };
}

export function mapProductToDetailData(product: Product): ProductDetailData {
  const priceForIndividual = product.pricing?.priceForIndividual ?? 0;
  const discountInfo = mapDiscountPercentage(
    product.pricing?.discount,
    priceForIndividual,
  );
  const { finalPrice, hasDiscount, discountPercentage } =
    calculatePriceBreakdown(priceForIndividual, {
      isActive: discountInfo.isActive,
      percentage: discountInfo.percentage,
    });

  const brand: ProductBrandInfo = {
    manufacturer: product.brand?.manufacturer ?? null,
    warrantyMonths: product.brand?.warrantyMonths ?? null,
  };

  const dimensions: ProductDimensionsInfo = {
    weight: product.dimensions?.weight ?? null,
    length: product.dimensions?.length ?? null,
    width: product.dimensions?.width ?? null,
    height: product.dimensions?.height ?? null,
  };

  return {
    id: String(product.id),
    title: product.title,
    slug: product.slug ?? "",
    description: product.description ?? "",
    category: mapCategory(product.category),
    images: mapImages(product.images),
    priceForIndividual,
    finalPrice,
    hasDiscount,
    discountPercentage,
    status: mapStatus(product.inventory?.status),
    minOrderQuantity: product.inventory?.minOrderQuantity ?? 1,
    maxOrderQuantity: product.inventory?.maxOrderQuantity ?? 9999,
    specifications: mapSpecifications(product.specifications),
    brand,
    dimensions,
    instruction: mapInstruction(product.instruction),
  };
}
