/**
 * Разбор ссылок на внешнее видео в безопасный embed-URL.
 *
 * Зачем вообще парсер, а не «вставим ссылку в iframe src»: src внешнего
 * фрейма — это исполняемый контекст в рамках нашей страницы. Произвольный
 * адрес из админки означал бы, что кто угодно с доступом к контенту может
 * встроить любой сайт (фишинговую форму, оверлей поверх интерфейса). Поэтому
 * работает белый список: адрес нормализуется в известный embed-эндпоинт
 * конкретного провайдера, а всё, что не распознано, не встраивается вообще.
 *
 * Хосты из ALLOWED_EMBED_FRAME_SRC должны быть перечислены в директиве
 * frame-src в proxy.ts — иначе строгий CSP молча заблокирует фрейм.
 */

export type VideoProvider = "youtube" | "vimeo" | "vk" | "rutube";

export interface ParsedVideoEmbed {
	provider: VideoProvider;
	/** Готовый src для <iframe>. */
	embedUrl: string;
	/** Исходная ссылка — показываем как запасной вариант, если фрейм не грузится. */
	originalUrl: string;
}

/**
 * Источники, разрешённые в CSP frame-src. Держим рядом с парсером, чтобы
 * список нельзя было расширить в одном месте и забыть про другое.
 */
export const ALLOWED_EMBED_FRAME_SRC = [
	"https://www.youtube-nocookie.com",
	"https://www.youtube.com",
	"https://player.vimeo.com",
	"https://vk.com",
	"https://vkvideo.ru",
	"https://rutube.ru",
] as const;

function isHost(hostname: string, ...allowed: string[]): boolean {
	const host = hostname.replace(/^www\./, "").toLowerCase();
	return allowed.includes(host);
}

/** Идентификаторы провайдеров состоят только из безопасных символов. */
const SAFE_ID = /^[\w-]{1,64}$/;

export function parseVideoUrl(
	raw: string | null | undefined,
): ParsedVideoEmbed | null {
	if (!raw || typeof raw !== "string") return null;

	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		return null;
	}

	// Только https: http-фрейм на https-странице всё равно заблокирован
	// (mixed content + upgrade-insecure-requests), а другие схемы —
	// javascript:, data: — это прямой XSS.
	if (url.protocol !== "https:") return null;

	// ── YouTube ──────────────────────────────────────────────────────────────
	if (
		isHost(url.hostname, "youtube.com", "youtube-nocookie.com", "m.youtube.com")
	) {
		const id =
			url.searchParams.get("v") ??
			url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1] ??
			null;
		if (!id || !SAFE_ID.test(id)) return null;
		// nocookie-домен: YouTube не ставит трекинговые cookie до запуска ролика.
		return {
			provider: "youtube",
			embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
			originalUrl: url.toString(),
		};
	}
	if (isHost(url.hostname, "youtu.be")) {
		const id = url.pathname.slice(1);
		if (!SAFE_ID.test(id)) return null;
		return {
			provider: "youtube",
			embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
			originalUrl: url.toString(),
		};
	}

	// ── Vimeo ────────────────────────────────────────────────────────────────
	if (isHost(url.hostname, "vimeo.com", "player.vimeo.com")) {
		const id = url.pathname.match(/(\d{6,})/)?.[1];
		if (!id) return null;
		return {
			provider: "vimeo",
			embedUrl: `https://player.vimeo.com/video/${id}`,
			originalUrl: url.toString(),
		};
	}

	// ── VK Видео ─────────────────────────────────────────────────────────────
	if (isHost(url.hostname, "vk.com", "vkvideo.ru")) {
		// Форматы: /video-123456_789012 и /video_ext.php?oid=..&id=..&hash=..
		const inline = url.pathname.match(/\/video(-?\d+)_(\d+)/);
		if (inline) {
			return {
				provider: "vk",
				embedUrl: `https://vk.com/video_ext.php?oid=${inline[1]}&id=${inline[2]}`,
				originalUrl: url.toString(),
			};
		}
		const oid = url.searchParams.get("oid");
		const id = url.searchParams.get("id");
		const hash = url.searchParams.get("hash");
		if (oid && id && /^-?\d+$/.test(oid) && /^\d+$/.test(id)) {
			const hashPart = hash && SAFE_ID.test(hash) ? `&hash=${hash}` : "";
			return {
				provider: "vk",
				embedUrl: `https://vk.com/video_ext.php?oid=${oid}&id=${id}${hashPart}`,
				originalUrl: url.toString(),
			};
		}
		return null;
	}

	// ── Rutube ───────────────────────────────────────────────────────────────
	if (isHost(url.hostname, "rutube.ru")) {
		const id = url.pathname.match(
			/\/(?:video|play\/embed)\/([\da-f]{8,})/i,
		)?.[1];
		if (!id) return null;
		return {
			provider: "rutube",
			embedUrl: `https://rutube.ru/play/embed/${id}/`,
			originalUrl: url.toString(),
		};
	}

	return null;
}

/** Человекочитаемое имя провайдера — для подписи запасной ссылки. */
export const PROVIDER_LABEL: Record<VideoProvider, string> = {
	youtube: "YouTube",
	vimeo: "Vimeo",
	vk: "VK Видео",
	rutube: "Rutube",
};
