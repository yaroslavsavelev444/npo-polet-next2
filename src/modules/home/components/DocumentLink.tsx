import { ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import type { HomeDocumentLink } from "../lib/documents";

export function DocumentLink({ document }: { document: HomeDocumentLink }) {
	const className =
		"group grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b border-[var(--hairline)] py-3 no-underline transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--text-primary)_4%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] sm:grid-cols-[auto_minmax(0,1fr)_auto]";

	const body = (
		<>
			<FileText
				className="size-4 shrink-0 text-[var(--text-muted)] transition-colors duration-200 group-hover:text-[var(--primary)]"
				aria-hidden="true"
			/>
			{/* Очень длинное название не ломает раскладку: оно переносится, а
			    подпись формата остаётся прижатой к правому краю (shrink-0). */}
			<span className="min-w-0 text-[0.9375rem] leading-snug wrap-anywhere text-[var(--text-secondary)] transition-colors duration-200 group-hover:text-[var(--text-primary)]">
				{document.title}
			</span>
			<span className="u-mono col-start-2 flex items-center gap-1.5 text-[0.625rem] text-[var(--text-muted)] sm:col-start-auto">
				{document.meta}
				{document.kind === "external" && (
					<ExternalLink className="size-3" aria-hidden="true" />
				)}
			</span>
		</>
	);

	// Внутренний путь — обычная навигация, без новой вкладки: это своя же
	// страница, и история переходов должна остаться целой.
	if (document.kind === "internal") {
		return (
			<Link href={document.href} className={className}>
				{body}
			</Link>
		);
	}

	// Подпись для скринридера: «PDF · 1,2 МБ» рядом с названием он прочитает
	// как часть фразы, а вот то, что ссылка уводит на другой сайт или скачает
	// файл, из текста строки не следует.
	const hint =
		document.kind === "external"
			? " — откроется на другом сайте"
			: document.shouldDownload
				? " — скачать файл"
				: " — откроется в новой вкладке";

	return (
		<a
			href={document.href}
			className={className}
			target="_blank"
			rel="noopener noreferrer"
			{...(document.shouldDownload ? { download: "" } : {})}
			aria-label={`${document.title}${hint}`}
		>
			{body}
		</a>
	);
}
