import { RichText } from "@payloadcms/richtext-lexical/react";
import type { KnowledgeTopic } from "@/payload-types";
import { cn } from "@/utils/cn";
import { knowledgeConverters } from "./converters";

/**
 * Тело статьи.
 *
 * `disableContainer` + собственная обёртка: контейнер библиотеки принимает
 * className, но при disableContainer его просто нет, а без disableContainer
 * появляется лишний div со своими классами. Обёртка здесь — то, на чём висит
 * типографика (.knowledge-prose в globals.css).
 */
export function RichContent({
	content,
	className,
}: {
	content: KnowledgeTopic["content"];
	className?: string;
}) {
	if (!content) return null;

	return (
		<div className={cn("knowledge-prose", className)}>
			<RichText
				data={content}
				converters={knowledgeConverters}
				disableContainer
			/>
		</div>
	);
}
