import type { ReactNode } from "react";
import type { HomeDocumentLink } from "../lib/documents";
import { DocumentLink } from "./DocumentLink";

export function TrustDocuments({
	title,
	lead,
	documents,
	emptyMessage,
	children,
}: {
	title: string;
	lead: string;
	documents: HomeDocumentLink[];
	emptyMessage: ReactNode;
	children?: ReactNode;
}) {
	return (
		<>
			<h3 className="text-[1.125rem] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
				{title}
			</h3>
			<p className="mt-2 text-[0.875rem] leading-[1.6] text-[var(--text-muted)]">
				{lead}
			</p>
			{documents.length > 0 ? (
				<ul className="mt-6 list-none p-0">
					{documents.map((document) => (
						<li key={document.id}>
							<DocumentLink document={document} />
						</li>
					))}
				</ul>
			) : (
				<p className="mt-6 text-[0.875rem] text-[var(--text-muted)]">
					{emptyMessage}
				</p>
			)}
			{children}
		</>
	);
}
