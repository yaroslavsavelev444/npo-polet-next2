import type { ConsentBlock } from "../lib/parseConsent";
import { ConsentInline, linkify } from "./ConsentInline";
import styles from "./Consents.module.css";

/**
 * Текст соглашения, разобранный на разделы, пункты и списки
 * (lib/parseConsent.ts).
 *
 * Номер у раздела, пункта и подзаголовка — отдельный элемент, а не часть
 * строки: на широком экране он висит в левом поле (см. .doc в
 * Consents.module.css), и текст всех уровней стоит одним краем.
 *
 * Компонент серверный: документ — это 10–15 тысяч знаков, и гидратировать
 * их незачем. Клиентская только навигация по разделам (ConsentToc).
 */
export function ConsentDocument({ blocks }: { blocks: ConsentBlock[] }) {
	return (
		<article className={styles.doc}>
			{blocks.map((block, index) => {
				const key = `${block.type}-${index}`;

				switch (block.type) {
					case "section":
						return (
							<h2
								key={key}
								id={block.id}
								// Фокус переходит на раздел после выбора в оглавлении:
								// скринридер продолжает чтение отсюда, а не с начала.
								tabIndex={-1}
								className={styles.section}
							>
								<span className={styles.number}>{block.number}.</span>
								{block.title}
							</h2>
						);

					case "subsection":
						return (
							<h3 key={key} className={styles.subsection}>
								<span className={styles.number}>{block.number}</span>
								{block.title}
							</h3>
						);

					case "clause":
						return (
							<p key={key} className={styles.clause}>
								<span className={styles.number}>{block.number}</span>
								{linkify(block.text)}
							</p>
						);

					case "list":
						return (
							<ul key={key} className={styles.list}>
								{block.items.map((item, itemIndex) => (
									<li key={itemIndex} className={styles.listItem}>
										<ConsentInline text={item} />
									</li>
								))}
							</ul>
						);

					case "record":
						return (
							<dl key={key} className={styles.record}>
								{block.fields.map((field, fieldIndex) => (
									<div key={fieldIndex} className={styles.recordRow}>
										<dt className={styles.recordLabel}>{field.label}</dt>
										<dd className={styles.recordValue}>
											{fieldIndex === 0 ? (
												<span className={styles.recordName}>{field.value}</span>
											) : (
												linkify(field.value)
											)}
										</dd>
									</div>
								))}
							</dl>
						);

					default:
						return (
							<p key={key} className={styles.paragraph}>
								<ConsentInline text={block.text} />
							</p>
						);
				}
			})}
		</article>
	);
}
