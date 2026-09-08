import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * FAQ: rich-text вместо простого текста в ответах, якори для тем и вопросов,
 * отбор вопросов на главную.
 *
 * Что меняется и зачем:
 *
 *  1. `faq_questions.answer`: varchar → jsonb. В ответах регулярно нужны
 *     список («что входит в комплект»), ссылка на карточку товара и
 *     выделение — простым текстом это писалось сплошным абзацем. Хранилище
 *     редактора Lexical — JSON, поэтому и тип колонки меняется.
 *
 *  2. `faq.slug` и `faq_questions.slug`: якори для прямых ссылок
 *     (/faq#dostavka-sroki). Ссылка на порядковый номер вопроса ломается при
 *     любой перестановке, ссылка на slug — нет.
 *
 *  3. `faq_questions.is_featured`: какие вопросы показывать на главной.
 *     Отбор «первые пять по порядку» связал бы две независимые вещи — порядок
 *     чтения полного FAQ и список самых частых вопросов.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * О ПРЕОБРАЗОВАНИИ ОТВЕТОВ
 * ────────────────────────────────────────────────────────────────────────────
 * Существующий текст НЕ теряется: он заворачивается в минимальный документ
 * Lexical (root → paragraph → text) прямо в SQL. Структура намеренно
 * минимальная — ровно те поля, которые редактор требует при загрузке
 * документа; всё остальное он проставит сам при первом сохранении.
 *
 * Переносы строк в исходном тексте становятся отдельными абзацами: в textarea
 * они были единственным доступным способом разделить мысли, и схлопывать их в
 * один абзац значило бы ухудшить существующие ответы.
 *
 * Пустые строки после разбиения отбрасываются, иначе редактор получит
 * абзац-призрак без текстового узла.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
		ALTER TABLE "faq" ADD COLUMN IF NOT EXISTS "slug" varchar;
		ALTER TABLE "faq_questions" ADD COLUMN IF NOT EXISTS "slug" varchar;
		ALTER TABLE "faq_questions" ADD COLUMN IF NOT EXISTS "is_featured" boolean DEFAULT false;
	`);

	await db.execute(sql`
		CREATE INDEX IF NOT EXISTS "faq_slug_idx" ON "faq" USING btree ("slug");
		CREATE INDEX IF NOT EXISTS "faq_questions_is_featured_idx" ON "faq_questions" USING btree ("is_featured");
	`);

	// Промежуточная колонка, а не преобразование на месте: USING-выражение,
	// упавшее на одной строке, откатило бы ALTER целиком и не дало бы понять,
	// какая именно строка виновата. Здесь исходные данные остаются нетронутыми
	// до самого конца.
	await db.execute(sql`
		ALTER TABLE "faq_questions" ADD COLUMN IF NOT EXISTS "answer_json" jsonb;
	`);

	await db.execute(sql`
		UPDATE "faq_questions"
		SET "answer_json" = jsonb_build_object(
			'root', jsonb_build_object(
				'type', 'root',
				'format', '',
				'indent', 0,
				'version', 1,
				'direction', 'ltr',
				'children', COALESCE(
					(
						SELECT jsonb_agg(
							jsonb_build_object(
								'type', 'paragraph',
								'format', '',
								'indent', 0,
								'version', 1,
								'direction', 'ltr',
								'textFormat', 0,
								'children', jsonb_build_array(
									jsonb_build_object(
										'type', 'text',
										'text', line,
										'format', 0,
										'style', '',
										'mode', 'normal',
										'detail', 0,
										'version', 1
									)
								)
							)
						)
						FROM unnest(
							string_to_array(regexp_replace("answer", E'\\r\\n?', E'\\n', 'g'), E'\\n')
						) AS line
						WHERE btrim(line) <> ''
					),
					-- Ответ мог состоять из одних пробелов: пустой массив
					-- children редактор принимает, отсутствующий — нет.
					'[]'::jsonb
				)
			)
		)
		WHERE "answer_json" IS NULL;
	`);

	await db.execute(sql`
		ALTER TABLE "faq_questions" DROP COLUMN "answer";
		ALTER TABLE "faq_questions" RENAME COLUMN "answer_json" TO "answer";
		ALTER TABLE "faq_questions" ALTER COLUMN "answer" SET NOT NULL;
	`);
}

/**
 * Откат сворачивает документ обратно в простой текст: абзацы склеиваются
 * переносами строки, разметка (ссылки, выделение) теряется — вернуть её в
 * varchar невозможно. Это осознанная асимметрия: назад откатываются, чтобы
 * починить схему, а не чтобы продолжить работать на старой.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
		ALTER TABLE "faq_questions" ADD COLUMN IF NOT EXISTS "answer_text" varchar;
	`);

	await db.execute(sql`
		UPDATE "faq_questions"
		SET "answer_text" = COALESCE(
			(
				SELECT string_agg(node->>'text', E'\\n')
				FROM jsonb_path_query("answer", '$.root.**.children[*] ? (@.type == "text")') AS node
			),
			''
		);
	`);

	await db.execute(sql`
		ALTER TABLE "faq_questions" DROP COLUMN "answer";
		ALTER TABLE "faq_questions" RENAME COLUMN "answer_text" TO "answer";
		ALTER TABLE "faq_questions" ALTER COLUMN "answer" SET NOT NULL;
	`);

	await db.execute(sql`
		DROP INDEX IF EXISTS "faq_questions_is_featured_idx";
		DROP INDEX IF EXISTS "faq_slug_idx";
		ALTER TABLE "faq_questions" DROP COLUMN IF EXISTS "is_featured";
		ALTER TABLE "faq_questions" DROP COLUMN IF EXISTS "slug";
		ALTER TABLE "faq" DROP COLUMN IF EXISTS "slug";
	`);
}
