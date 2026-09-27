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

/**
 * Условия возврата для Offer (hasMerchantReturnPolicy).
 *
 * Значения взяты из публичной оферты (/consents/offer, раздел 8), а не
 * придуманы для разметки: покупатель-физлицо вправе вернуть товар
 * надлежащего качества в течение 7 дней с момента получения (ст. 26.1
 * ЗоЗПП), доставка при возврате за его счёт (п. 8.3). Цена в Offer — цена для
 * физлиц, поэтому и политика — потребительская; для юрлиц оферта отсылает к
 * ГК РФ и отдельному соглашению, в разметку это не выносится.
 *
 * Меняются условия в оферте — меняются и здесь: Google сверяет разметку с
 * тем, что написано на сайте.
 */
const MERCHANT_RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "RU",
  returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
  merchantReturnDays: 7,
  returnMethod: "https://schema.org/ReturnByMail",
  returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
} as const;

/**
 * Отзыв в том виде, в каком он уже показан на странице товара. Разметка
 * описывает только видимые отзывы — таково требование Google к review.
 */
export interface ProductJsonLdReview {
  rating: number;
  title: string | null;
  comment: string;
  authorName: string;
  createdAt: string;
}

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
  brand?: {
    "@type": "Brand";
    name: string;
  };
  aggregateRating?: {
    "@type": "AggregateRating";
    ratingValue: number;
    reviewCount: number;
  };
  review?: Array<{
    "@type": "Review";
    name?: string;
    reviewBody: string;
    datePublished: string;
    author: { "@type": "Person"; name: string };
    reviewRating: { "@type": "Rating"; ratingValue: number; bestRating: 5 };
  }>;
  offers: {
    "@type": "Offer";
    url: string;
    priceCurrency: "RUB";
    price: number;
    availability: string;
    itemCondition: string;
    seller: {
      "@type": "Organization";
      name: string;
    };
    hasMerchantReturnPolicy: typeof MERCHANT_RETURN_POLICY;
  };
}

/**
 * Строит Schema.org Product JSON-LD для одного товара.
 * `canonicalUrl` — абсолютный URL страницы товара, `reviews` — отзывы,
 * отрисованные на этой странице (первая порция секции отзывов).
 */
export function buildProductJsonLd(
  product: ProductCardData,
  canonicalUrl: string,
  reviews: ProductJsonLdReview[] = [],
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
    // category намеренно не передаётся. Search Console (сентябрь 2026)
    // помечал название раздела сайта («Ручные сеткомёты») как «Недопустимое
    // значение в поле category», хотя документация уже допускает текст
    // наравне с кодом Google Product Taxonomy (CategoryCode). Поле
    // рекомендуемое, а принадлежность к разделу и так передаёт
    // BreadcrumbList на той же странице — проще не отдавать его вовсе, чем
    // держать предупреждение на каждом товаре.
    // brand заполнен не у всех товаров, а пустой Brand в разметке — прямая
    // ошибка в валидаторах Яндекса и Google, поэтому ключ добавляем только
    // при наличии значения.
    ...(product.brand
      ? { brand: { "@type": "Brand" as const, name: product.brand } }
      : {}),
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "RUB",
      price: finalPrice,
      availability: AVAILABILITY_SCHEMA_MAP[product.status],
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: SITE_NAME,
      },
      hasMerchantReturnPolicy: MERCHANT_RETURN_POLICY,
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

    if (reviews.length > 0) {
      jsonLd.review = reviews.map((review) => ({
        "@type": "Review",
        ...(review.title ? { name: review.title } : {}),
        reviewBody: review.comment,
        datePublished: review.createdAt,
        author: { "@type": "Person", name: review.authorName },
        reviewRating: {
          "@type": "Rating",
          ratingValue: review.rating,
          bestRating: 5,
        },
      }));
    }
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
