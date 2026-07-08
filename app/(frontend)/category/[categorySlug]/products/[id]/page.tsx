import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import {
  buildProductJsonLd,
  buildProductMetadata,
  getProductHref,
  mapProductToCardData,
} from "@/modules/productCard";
import {
  getRelatedProducts,
  mapProductToDetailData,
  ProductCharacteristicsPreview,
  ProductDetailTabs,
  ProductGallery,
  ProductHeader,
  ProductRelated,
} from "@/modules/productDetails";
import { getCachedProductById } from "@/payload/services/products.service";
import { baseURL } from "@/resources/content";
export const dynamic = "force-dynamic";
interface Props {
  params: Promise<{ categorySlug: string; id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorySlug, id } = await params;
  const product = await getCachedProductById(id);
  if (!product) return { title: "Товар не найден" };

  const cardData = mapProductToCardData(product);
  const canonicalUrl = `${baseURL}${getProductHref(cardData, categorySlug)}`;

  return buildProductMetadata(cardData, {
    metaTitle: product.seo?.metaTitle,
    metaDescription: product.seo?.metaDescription,
    canonicalUrl,
  });
}

export default async function ProductDetailPage({ params }: Props) {
  const { categorySlug, id } = await params;
  const product = await getCachedProductById(id);
  if (!product) notFound();

  const cardData = mapProductToCardData(product);
  const detailData = mapProductToDetailData(product);

  const upsellIds = detailData.upsellProducts.map((p) => p.id);

  const relatedProducts = detailData.category
    ? await getRelatedProducts(detailData.category.id, detailData.id, upsellIds)
    : [];

  const canonicalUrl = `${baseURL}${getProductHref(cardData, categorySlug)}`;
  const jsonLd = buildProductJsonLd(cardData, canonicalUrl);

  const breadcrumbItems = [
    { title: "Главная", href: "/" },
    { title: "Категории", href: "/category" },
    ...(detailData.category
      ? [
          {
            title: detailData.category.title,
            href: `/category/${detailData.category.slug}`,
          },
        ]
      : []),
    { title: detailData.title },
  ];

  return (
    <main className="min-h-screen pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs items={breadcrumbItems} variant="white" />

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <ProductGallery images={detailData.images} title={detailData.title} />

          <div className="flex flex-col gap-8">
            <ProductHeader product={detailData} cardData={cardData} />
            <ProductCharacteristicsPreview
              specifications={detailData.specifications}
            />
          </div>
        </div>

        <div className="mt-10">
          <ProductDetailTabs product={detailData} />
        </div>

        <div className="mt-14">
          <ProductRelated products={relatedProducts} />
        </div>
      </div>
    </main>
  );
}
