import { ExternalLink } from "lucide-react";
import type { Media } from "@/payload-types";
import { PROVIDER_LABEL, parseVideoUrl } from "../../lib/videoEmbed";

/**
 * Внешнее видео.
 *
 * src фрейма собирает парсер с белым списком провайдеров (см. videoEmbed.ts) —
 * произвольный адрес из админки сюда не попадёт. Нераспознанная ссылка не
 * встраивается вообще: вместо неё показываем обычную ссылку, чтобы материал
 * не терялся.
 *
 * sandbox не ставим: плееры YouTube/VK без allow-scripts и allow-same-origin
 * не работают, а с ними sandbox уже ничего не ограничивает. Реальная защита
 * здесь — белый список источников и CSP frame-src.
 */
export function VideoEmbed({
	url,
	title,
	caption,
}: {
	url: string;
	title?: string | null;
	caption?: string | null;
}) {
	const parsed = parseVideoUrl(url);

	if (!parsed) {
		return (
			<p className="my-6">
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer nofollow"
					className="inline-flex items-center gap-1.5 text-[var(--accent)] underline underline-offset-4 transition-colors hover:text-[var(--accent-hover)]"
				>
					{title || "Смотреть видео"}
					<ExternalLink size={14} aria-hidden />
				</a>
			</p>
		);
	}

	return (
		<figure className="my-8 flex flex-col gap-2.5">
			<div className="relative aspect-video overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-black">
				<iframe
					src={parsed.embedUrl}
					title={title || `Видео ${PROVIDER_LABEL[parsed.provider]}`}
					loading="lazy"
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
					allowFullScreen
					className="absolute inset-0 h-full w-full border-0"
				/>
			</div>

			{caption && (
				<figcaption className="text-sm leading-relaxed text-[var(--text-secondary)]">
					{caption}
				</figcaption>
			)}
		</figure>
	);
}

/**
 * Видеофайл из медиатеки.
 *
 * preload="metadata" — принципиально: с preload="auto" браузер начнёт тянуть
 * весь ролик при открытии страницы, даже если его никто не запустит.
 */
export function VideoFile({
	video,
	poster,
	caption,
}: {
	video: Media;
	poster?: Media | null;
	caption?: string | null;
}) {
	if (!video.url) return null;

	return (
		<figure className="my-8 flex flex-col gap-2.5">
			{/* Дорожки субтитров нет: отдельного поля под VTT в админке не
			    заведено, а смысл ролика дублируется подписью и текстом статьи. */}
			<video
				controls
				preload="metadata"
				playsInline
				poster={poster?.url ?? undefined}
				className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-black"
			>
				<source src={video.url} type={video.mimeType ?? undefined} />
				Ваш браузер не умеет воспроизводить это видео.{" "}
				<a href={video.url} download>
					Скачать файл
				</a>
			</video>

			{(caption || video.caption) && (
				<figcaption className="text-sm leading-relaxed text-[var(--text-secondary)]">
					{caption || video.caption}
				</figcaption>
			)}
		</figure>
	);
}
