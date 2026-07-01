/**
 * modules/productCard/lib/seo.ts
 *
 * SEO-хелперы для страницы товара: Schema.org JSON-LD (Product + Offer)
 * и билдер next/Metadata. Вынесены из карточки, т.к. используются на уровне
 * страницы товара (app/.../products/[id]/page.tsx), а не самим компонентом
 * карточки в листинге.
 */

import type { Metadata } from "next";
import type { ProductCardData } from "../types";
import { calculatePriceBreakdown } from "./pricing";

const SITE_NAME = "НПО Полёт";

const AVAILABILITY_SCHEMA_MAP: Record<ProductCardData["status"], string> = {
  available: "https://schema.org/InStock",
  preorder: "https://schema.org/PreOrder",
  out_of_stock: "https://schema.org/OutOfStock",
  discontinued: "https://schema.org/Discontinued",
};

export interface ProductJsonLd {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  description?: string;
  image: string[];
  sku: string;
  category?: string;
  aggregateRating?: {
    "@type": "AggregateRating";
    ratingValue: number;
    reviewCount: number;
  };
  offers: {
    "@type": "Offer";
    url: string;
    priceCurrency: "RUB";
    price: number;
    availability: string;
  };
}

/**
 * Строит Schema.org Product JSON-LD для одного товара.
 * `canonicalUrl` — абсолютный URL страницы товара.
 */
export function buildProductJsonLd(
  product: ProductCardData,
  canonicalUrl: string,
): ProductJsonLd {
  const { finalPrice } = calculatePriceBreakdown(
    product.priceForIndividual,
    product.discount,
  );

  const jsonLd: ProductJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: product.images.map((img) => img.url).filter(Boolean),
    sku: product.slug,
    category: product.category?.title,
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "RUB",
      price: finalPrice,
      availability: AVAILABILITY_SCHEMA_MAP[product.status],
    },
  };

  // aggregateRating добавляем только если реально есть отзывы — Google
  // штрафует за фиктивный/нулевой рейтинг в structured data.
  if (product.reviewsCount > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.reviewsCount,
    };
  }

  return jsonLd;
}

/**
 * Строит next/Metadata для страницы товара. Использует поля product.seo,
 * если они заполнены в админке, иначе генерирует разумный дефолт.
 */
export function buildProductMetadata(
  product: ProductCardData,
  options: {
    metaTitle?: string | null;
    metaDescription?: string | null;
    canonicalUrl: string;
  },
): Metadata {
  const title = options.metaTitle || `${product.title} — купить | ${SITE_NAME}`;
  const description =
    options.metaDescription ||
    product.description?.slice(0, 160) ||
    `${product.title} — характеристики, цена и наличие. Купить с доставкой.`;

  const primaryImage = product.images[0]?.url;

  return {
    title,
    description,
    alternates: {
      canonical: options.canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: options.canonicalUrl,
      siteName: SITE_NAME,
      type: "website",
      images: primaryImage ? [{ url: primaryImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: primaryImage ? [primaryImage] : undefined,
    },
  };
}
