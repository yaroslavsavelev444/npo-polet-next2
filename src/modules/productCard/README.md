# modules/productCard

Карточка товара: перенесена со старого стека (React + react-router + MobX +
antd) на новый (Next.js App Router + Tailwind v4 + once-ui + zustand).

## Структура

```
modules/productCard/
├── index.ts                     # публичный API модуля
├── types/index.ts                # ProductCardData и пропсы под-компонентов
├── lib/
│   ├── adapter.ts                 # Payload Product -> ProductCardData
│   ├── pricing.ts                 # расчёт цены/скидки, валидация количества
│   ├── format.ts                  # форматирование цены/отзывов под ru-RU
│   ├── routing.ts                 # резолвинг href товара
│   └── seo.ts                     # Schema.org JSON-LD + next/Metadata
├── hooks/
│   ├── useProductQuantity.ts      # локальный state степпера + валидация
│   ├── useAddToCart.ts            # мутация cartStore + toast
│   └── useToggleWishlist.ts       # мутация wishlistStore + toast
└── components/
    ├── ProductCard.tsx            # композиционный корень (Server Component)
    ├── ProductCardSkeleton.tsx    # loading-плейсхолдер той же геометрии
    ├── ProductImage.tsx           # картинка + hover zoom (CSS, server)
    ├── ProductActions.tsx         # избранное / quick view (Client Component)
    ├── ProductQuantitySelector.tsx # степпер + "В корзину" (Client Component)
    ├── ProductPrice.tsx           # цена/скидка (server)
    ├── ProductRating.tsx          # рейтинг/отзывы (server)
    ├── ProductStatusBadge.tsx     # статус "предзаказ"/"нет в наличии" (server)
    └── ProductTitle.tsx           # заголовок с line-clamp (server)
```

## Архитектурные решения

**Server/Client разделение.** `ProductCard` — Server Component. Интерактивность
(избранное, степпер, добавление в корзину) вынесена в листовые `"use client"`
островки. В листинге каталога на 40 карточек гидрируется не вся карточка,
а только её маленькие интерактивные части — меньше JS на клиенте, быстрее
LCP/TTI.

**Адаптер вместо прямого использования Payload-типа.** Текущая Payload-схема
`products` не содержит `sku`, `rating`, `reviewsCount` и нормального диапазона
цен для опта — но они использовались в старом UI. Вместо того чтобы размазать
эти допущения по компонентам, весь маппинг `Product -> ProductCardData` стоит
в одном файле — `lib/adapter.ts`. Когда поля появятся в схеме, меняется
только адаптер.

```ts
import { mapProductToCardData } from "@/modules/productCard";
import type { Product } from "@/payload-types";

const cardData = mapProductToCardData(product); // Product приходит из getCachedProducts()
```

**Роутинг.** `/categories/[categorySlug]/products/[id]` (используется id товара,
т.к. slug/sku ещё не гарантированы в схеме). См. `lib/routing.ts`.
Когда появится отдельный route
`app/(frontend)/categories/[categorySlug]/products/[id]/page.tsx`, эта функция —
единственное место, которое надо будет поправить, если формат URL изменится.

**Клиентское состояние (корзина/избранное).** Гибридная схема:
- `zustand` (`src/shared/store/cartStore.ts`, `wishlistStore.ts`) — источник
  истины для UI, с `persist` в localStorage. Даёт мгновенный optimistic UX
  (счётчик в Header, кнопка "в корзине"/"добавить") без сетевого round-trip
  на каждое действие. Прямой аналог MobX `cartStore`/`wishlistStore` из
  старого проекта, просто на другом стейт-менеджере.
- `@tanstack/react-query` — слой синхронизации с сервером *поверх* zustand,
  когда дойдёт очередь до страниц корзины/избранного (мердж гостевой корзины
  после логина, периодическая ресинхронизация, мутации на сервер). Сами
  сторы уже спроектированы под это: TODO-комментарии отмечают, где будет
  встроена сетевая синхронизация.

**SEO.** `lib/seo.ts` даёт `buildProductMetadata` (next/Metadata: title,
description, OG, canonical) и `buildProductJsonLd` (Schema.org `Product` +
`Offer`, опционально `AggregateRating`, если есть реальные отзывы).
Использовать на странице товара:

```tsx
// app/(frontend)/categories/[categorySlug]/products/[id]/page.tsx
import { mapProductToCardData, buildProductMetadata, buildProductJsonLd } from "@/modules/productCard";

export async function generateMetadata({ params }): Promise<Metadata> {
  const product = await getCachedProductById(params.id);
  if (!product) return {};
  const cardData = mapProductToCardData(product);
  const canonicalUrl = `${env.SITE_URL}/categories/${params.categorySlug}/products/${params.id}`;
  return buildProductMetadata(cardData, {
    metaTitle: product.seo?.metaTitle,
    metaDescription: product.seo?.metaDescription,
    canonicalUrl,
  });
}

export default async function ProductPage({ params }) {
  const product = await getCachedProductById(params.id);
  if (!product) notFound();
  const cardData = mapProductToCardData(product);
  const jsonLd = buildProductJsonLd(cardData, canonicalUrl);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* ... контент страницы товара ... */}
    </>
  );
}
```

## Подключение в приложении (обязательные шаги)

1. `ToastProvider` уже добавлен в `src/providers/Providers.tsx` — без него
   хуки `useAddToCart`/`useToggleWishlist` упадут на `useToast()`, т.к. это
   React Context.
2. once-ui `ThemeProvider`/`IconProvider`/глобальные стили — уже подключены
   (подтверждено перед переносом).

## Использование

```tsx
import { ProductCard, mapProductToCardData } from "@/modules/productCard";

function CategoryGrid({ products, categorySlug }: { products: Product[]; categorySlug: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={mapProductToCardData(product)}
          currentCategorySlug={categorySlug}
          priorityImage={index < 4} // LCP-оптимизация для первого экрана
        />
      ))}
    </div>
  );
}
```

## Известные TODO / задел на будущее

- **`lib/adapter.ts`**: `rating`/`reviewsCount` зашиты как `0` — нужна
  агрегация из коллекции `reviews` (Payload `afterChange` hook, обновляющий
  денормализованные `analytics.rating`/`analytics.reviewsCount` на `Product`,
  либо отдельный сервис `getProductRatingAggregate(productId)`).
- **`lib/adapter.ts`**: нет `sku` в схеме — используется `id` для URL. Если
  `sku` понадобится для отображения (не только для роутинга), добавить поле
  в коллекцию `Products` и прокинуть в адаптер.
- **`shared/store/cartStore.ts` / `wishlistStore.ts`**: нет серверной
  синхронизации (см. TODO-комментарии в файлах) — это следующий шаг при
  реализации страниц `/cart` и `/wishlist`. Понадобятся Payload-коллекции
  `carts`/`wishlists` (уже есть в дереве проекта, `src/payload/collections/`)
  и сервисы по аналогии с `products.service.ts`.
- **Quick view**: компонент `ProductActions` принимает `onQuickView`, но
  сама модалка быстрого просмотра не реализована — это решение родителя
  (страницы каталога), карточка только эмитит событие.
- **Auth guard**: добавление в корзину/избранное сейчас разрешено гостям
  (типичный паттерн для e-commerce). Если требуется обязательная
  авторизация — обернуть `addToCart`/`toggleWishlist` проверкой сессии
  (`getCurrentUser`) на уровне хуков.
