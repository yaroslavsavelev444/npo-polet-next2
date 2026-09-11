"use client";

import { useId, useState } from "react";
import { isLongComment } from "../lib/format";
import styles from "./Reviews.module.css";

interface ReviewCommentProps {
	comment: string;
}

/**
 * Текст отзыва с раскрытием длинного комментария.
 *
 * Свёрнут до шести строк с затуханием внизу: обрыв на полуслове без
 * затухания читается как сбой вёрстки, а не как «есть продолжение».
 *
 * Нужна ли кнопка, решается ДЛИНОЙ строки, а не измерением высоты в браузере:
 * измерение возможно только после гидратации, и кнопка появлялась бы рывком
 * уже после того, как страницу начали читать. Порог в знаках даёт верный
 * ответ на сервере с первого кадра; ошибка в одну строку здесь безобидна.
 *
 * Текст ВСЕГДА целиком в разметке — свёрнут он только визуально. Поисковик и
 * скринридер читают отзыв полностью независимо от состояния кнопки.
 */
export function ReviewComment({ comment }: ReviewCommentProps) {
	const clampable = isLongComment(comment);
	const [expanded, setExpanded] = useState(false);
	const id = useId();

	return (
		<>
			<p
				id={id}
				className={styles.comment}
				data-clamped={clampable && !expanded ? "true" : undefined}
			>
				{comment}
			</p>

			{clampable && (
				<button
					type="button"
					onClick={() => setExpanded((value) => !value)}
					aria-expanded={expanded}
					aria-controls={id}
					className={styles.more}
				>
					{expanded ? "Свернуть" : "Читать полностью"}
				</button>
			)}
		</>
	);
}

export default ReviewComment;
