import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { RevealGroup } from "@/shared/components/motion/Reveal";
import { cn } from "@/utils/cn";
import type { ConsentSummary } from "../lib/summary";
import styles from "./Consents.module.css";

/**
 * Разлинованный перечень документов: название, редакция и с какого дня
 * действует. Тот же список стоит под каждым документом («Другие
 * документы») — там текущий отмечен акцентом и не ссылается сам на себя.
 */
export function ConsentRows({
	items,
	currentSlug,
	headingLevel = "h3",
}: {
	items: ConsentSummary[];
	currentSlug?: string;
	headingLevel?: "h2" | "h3";
}) {
	const Heading = headingLevel;

	return (
		<RevealGroup
			as="ul"
			childAs="li"
			childClassName={styles.rowItem}
			className={styles.rows}
			stagger={60}
		>
			{items.map((item) => {
				const current = item.slug === currentSlug;
				return (
					<Link
						key={item.slug}
						href={`/consents/${item.slug}`}
						aria-current={current ? "page" : undefined}
						className={cn(styles.row, current && styles.rowCurrent)}
					>
						<span className={styles.rowBody}>
							<Heading className={styles.rowTitle}>{item.title}</Heading>
							<span className={styles.rowMeta}>
								{item.edition && <span>{item.edition}</span>}
								{item.upcoming ? (
									<span className={styles.chip}>{item.status}</span>
								) : (
									item.status && <span>{item.status}</span>
								)}
							</span>
						</span>
						<ArrowRight size={18} className={styles.rowArrow} aria-hidden />
					</Link>
				);
			})}
		</RevealGroup>
	);
}
