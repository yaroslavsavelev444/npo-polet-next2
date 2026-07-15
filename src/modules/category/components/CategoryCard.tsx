import { ArrowRight, Package } from "lucide-react";
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

export default function CategoryCard({
	category,
	priority = false,
}: CategoryCardProps) {
	const image = getImageData(category.image);

	return (
		<Link
			href={`/category/${category.slug}`}
			aria-label={`Открыть категорию «${category.name}»`}
			className="
				group
				relative
				flex
				h-full
				flex-col
				overflow-hidden
				rounded-[var(--radius-lg)]
				border
				border-[var(--border)]
				bg-[var(--surface)]
				transition-all
				duration-300
				ease-out
				hover:-translate-y-1
				hover:border-[var(--primary)]/40
				hover:shadow-[0_16px_40px_var(--shadow-color)]
				focus-visible:outline-none
				focus-visible:ring-2
				focus-visible:ring-[var(--primary)]
				focus-visible:ring-offset-2
				focus-visible:ring-offset-[var(--background)]
				active:scale-[0.98]
			"
		>
			{/* Изображение: фиксированная геометрия, object-contain — не деформирует
			    и не обрезает PNG с прозрачным фоном при любых пропорциях исходника. */}
			<div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[var(--surface-secondary)]">
				{image ? (
					<Image
						src={image.url}
						alt={image.alt || category.name}
						fill
						priority={priority}
						loading={priority ? "eager" : "lazy"}
						sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
						className="object-contain p-7 transition-transform duration-500 ease-out group-hover:scale-[1.06]"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<Package
							size={40}
							strokeWidth={1.5}
							className="text-[var(--text-muted)]"
							aria-hidden
						/>
					</div>
				)}
			</div>

			{/* Контент: фиксированная высота заголовка/подзаголовка через
			    line-clamp + reserved min-height — геометрия карточки не зависит
			    от длины текста. !p-4/!pt-2 ниже: @once-ui-system/core грузится
			    раньше Tailwind (см. layout.tsx) и его collision-классы .p-4/.pt-2
			    перебивают padding без !important — как в NavbarClientIsland.tsx. */}
			<div className="flex flex-1 flex-col gap-1.5 !p-4">
				<h3 className="line-clamp-2 min-h-[2.5rem] text-base font-semibold leading-tight text-[var(--text-primary)] transition-colors duration-200 group-hover:text-[var(--primary)]">
					{category.name}
				</h3>

				<div className="min-h-[2.25rem]">
					{category.subtitle && (
						<p className="line-clamp-2 text-sm leading-relaxed text-[var(--text-secondary)]">
							{category.subtitle}
						</p>
					)}
				</div>

				<div className="mt-auto flex items-center gap-1 !pt-2 text-xs font-medium text-[var(--text-muted)] transition-colors duration-200 group-hover:text-[var(--primary)]">
					Смотреть категорию
					<ArrowRight
						size={13}
						className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
						aria-hidden
					/>
				</div>
			</div>
		</Link>
	);
}
