import Image from "next/image";
import type { Media } from "@/payload-types";

/**
 * Изображение внутри статьи.
 *
 * Штатный конвертер lexical отдаёт голый <img> с полноразмерным исходником —
 * то есть на мобильном экране грузится картинка на 1920px. Здесь работает
 * next/image: он выдаёт avif/webp нужного размера (см. images.formats в
 * next.config.ts), ставит lazy-загрузку и резервирует место под картинку,
 * чтобы текст не прыгал при её появлении.
 */
export function ContentImage({
	media,
	caption,
	alt,
}: {
	media: Media;
	caption?: string | null;
	alt?: string | null;
}) {
	if (!media.url) return null;

	const width = media.width ?? 1600;
	const height = media.height ?? 900;
	// Пустая строка — валидный alt для декоративной картинки: скринридер
	// пропустит её вместо того, чтобы зачитывать имя файла.
	const altText = alt ?? media.alt ?? "";

	return (
		<figure className="my-8 flex flex-col gap-2.5">
			<div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
				<Image
					src={media.url}
					alt={altText}
					width={width}
					height={height}
					sizes="(max-width: 768px) 100vw, 760px"
					loading="lazy"
					className="h-auto w-full"
				/>
			</div>

			{(caption || media.caption) && (
				<figcaption className="text-sm leading-relaxed text-[var(--text-secondary)]">
					{caption || media.caption}
				</figcaption>
			)}
		</figure>
	);
}
