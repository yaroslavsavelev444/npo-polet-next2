import { Minus, Plus } from "lucide-react";
import styles from "./Reviews.module.css";

interface ReviewProsConsProps {
	pros: string[];
	cons: string[];
}

/**
 * Достоинства и недостатки из отзыва.
 *
 * Поля есть в модели, и заполненные они — самая полезная часть отзыва:
 * короткие тезисы читаются быстрее абзаца. Показываются только непустые: две
 * подписи над пустотой полезнее не делают.
 *
 * Перечисление через запятую, а не списком: тезисы здесь короткие, и список
 * из двух слов занял бы больше места, чем сами слова.
 */
export function ReviewProsCons({ pros, cons }: ReviewProsConsProps) {
	if (pros.length === 0 && cons.length === 0) return null;

	return (
		<dl className={styles.prosCons}>
			{pros.length > 0 && (
				<div className={styles.prosConsGroup}>
					<dt className={`${styles.prosConsLabel} ${styles.prosLabel}`}>
						<Plus size={11} aria-hidden />
						Достоинства
					</dt>
					<dd className={`${styles.prosConsValue} m-0`}>{pros.join(", ")}</dd>
				</div>
			)}

			{cons.length > 0 && (
				<div className={styles.prosConsGroup}>
					<dt className={`${styles.prosConsLabel} ${styles.consLabel}`}>
						<Minus size={11} aria-hidden />
						Недостатки
					</dt>
					<dd className={`${styles.prosConsValue} m-0`}>{cons.join(", ")}</dd>
				</div>
			)}
		</dl>
	);
}

export default ReviewProsCons;
