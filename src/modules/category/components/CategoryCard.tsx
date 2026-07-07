import Image from "next/image";
import Link from "next/link";

import type { Category, Media } from "@/payload-types";

interface CategoryCardProps {
  category: Category;
  priority?: boolean;
}

interface ImageData {
  url: string;
  alt: string;
}

export function getImageData(image: Category["image"]): ImageData | null {
  if (!image || typeof image !== "object") {
    return null;
  }

  const media = image as Media;

  if (!media.url) {
    return null;
  }

  return {
    url: media.url,
    alt: media.alt ?? "",
  };
}

function extractKeywords(keywords: Category["keywords"]): string[] {
  if (!Array.isArray(keywords)) {
    return [];
  }

  return keywords
    .map((item) => (typeof item === "object" ? item.keyword : null))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
}

export default function CategoryCard({
  category,
  priority = false,
}: CategoryCardProps) {
  const image = getImageData(category.image);

  const keywords = extractKeywords(category.keywords);

  const productCount =
    typeof (category as Record<string, unknown>).productCount === "number"
      ? ((category as Record<string, unknown>).productCount as number)
      : null;

  return (
    <Link
      href={`/category/${category.slug}`}
      aria-label={`Открыть категорию "${category.name}"`}
      className="
        group
        relative
        flex
        h-full
        flex-col
        overflow-hidden
        rounded-2xl
        border
        border-[var(--border)]
        bg-[var(--surface)]
        transition-all
        duration-300
        hover:-translate-y-1
        hover:shadow-xl
        hover:border-[var(--brand-solid)]
        focus-visible:outline-none
        focus-visible:ring-2
        focus-visible:ring-[var(--brand-solid)]
      "
    >
      {productCount !== null && productCount > 0 && (
        <span
          className="
              absolute
              right-3
              top-3
              z-20
              rounded-full
              bg-[var(--brand-solid)]
              px-2.5
              py-1
              text-xs
              font-semibold
              leading-none
              text-white
              shadow-md
            "
        >
          {productCount}
        </span>
      )}

      <div
        className="
          relative
          aspect-[4/3]
          overflow-hidden
          border-b
          border-[var(--border)]
          bg-[var(--neutral-alpha-weak)]
        "
      >
        {image ? (
          <Image
            src={image.url}
            alt={image.alt || category.name}
            fill
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            sizes="
              (max-width:640px) 50vw,
              (max-width:1024px) 33vw,
              25vw
            "
            className="
              object-contain
              p-4
              transition-transform
              duration-500
              group-hover:scale-105
            "
          />
        ) : (
          <div
            className="
              flex
              h-full
              w-full
              items-center
              justify-center
              text-[var(--text-secondary)]
            "
          >
            <svg
              width="54"
              height="54"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M3 7h18" />
              <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
              <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
            </svg>
          </div>
        )}
      </div>

      <div
        className="
          flex
          flex-1
          flex-col
          gap-2
          p-4
        "
      >
        <h3
          className="
            line-clamp-1
            text-sm
            font-semibold
            text-[var(--text-primary)]
            transition-colors
            duration-300
            group-hover:text-[var(--brand-solid)]
          "
        >
          {category.name}
        </h3>

        {category.subtitle && (
          <p
            className="
              line-clamp-2
              text-sm
              text-[var(--text-secondary)]
            "
          >
            {category.subtitle}
          </p>
        )}

        {keywords.length > 0 && (
          <div
            className="
              mt-auto
              flex
              flex-wrap
              gap-2
              pt-2
            "
          >
            {keywords.map((keyword) => (
              <span
                key={keyword}
                className="
                    rounded-full
                    border
                    border-[var(--border)]
                    bg-[var(--neutral-alpha-weak)]
                    px-2
                    py-1
                    text-[11px]
                    text-[var(--text-secondary)]
                  "
              >
                {keyword}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
