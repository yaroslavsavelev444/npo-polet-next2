import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

/**
 * Низкоуровневые операции над активациями промокодов.
 *
 * Модуль намеренно НЕ импортирует `getPayload`, а принимает уже готовый
 * экземпляр аргументом. Причина практическая: эти же операции нужны хуку
 * коллекции заказов, а коллекции загружаются CLI Payload'а (генерация типов и
 * миграций) в обычном Node без Next.js — любой импорт `getPayload` в этой
 * цепочке тянет за собой рантайм Next и роняет CLI. У хука экземпляр
 * `req.payload` и так под рукой, так что аргумент здесь ничего не усложняет.
 *
 * Обёртки, работающие с глобальным экземпляром, живут в promo-codes.service.
 */

type DrizzleRows = { rows?: Record<string, unknown>[] };

function toNumber(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

export interface ReservePromoCodeInput {
	promoCodeId: string;
	code: string;
	userId: string;
	discountAmount: number;
}

/**
 * Списывает активацию промокода и заводит запись журнала — ОДНИМ SQL-запросом.
 *
 * Почему не «прочитать документ, проверить лимит, записать +1»: между чтением
 * и записью успевает вклиниться параллельное оформление заказа, и код с
 * лимитом в одну активацию уходит двум покупателям. Для промокода это не
 * теоретическая гонка, а типичный сценарий — код рассылают всем сразу, и
 * заказы по нему приходят одновременно.
 *
 * Здесь проверка ОБОИХ лимитов и инкремент — одна атомарная операция:
 * `UPDATE` перечитывает строку под блокировкой, а вставка журнала выполняется
 * только при успешном `UPDATE` (`FROM reserved`). Если лимит уже исчерпан,
 * запрос не меняет ничего и возвращает пустой результат.
 *
 * Активация резервируется ДО создания заказа и потому изначально без ссылки
 * на него: иначе порядок был бы «создать заказ со скидкой → попытаться
 * списать активацию → обнаружить, что лимит кончился», и в базе оставался бы
 * заказ со скидкой, которой покупатель не имел права получить.
 *
 * @returns id записи журнала или null, если лимит исчерпан.
 */
export async function reserveRedemption(
	payload: Payload,
	input: ReservePromoCodeInput,
): Promise<string | null> {
	const promoCodeId = Number(input.promoCodeId);
	const userId = Number(input.userId);
	const amount = input.discountAmount;

	const result = (await payload.db.drizzle.execute(sql`
		WITH user_uses AS (
			SELECT COUNT(*)::int AS cnt
			FROM promo_code_redemptions
			WHERE promo_code_id = ${promoCodeId}
			  AND user_id = ${userId}
			  AND status = 'applied'
		),
		reserved AS (
			UPDATE promo_codes p
			SET total_uses = COALESCE(p.total_uses, 0) + 1,
			    total_discount_amount = COALESCE(p.total_discount_amount, 0) + ${amount},
			    updated_at = now()
			FROM user_uses u
			WHERE p.id = ${promoCodeId}
			  AND p.is_active = true
			  AND (p.max_uses IS NULL OR COALESCE(p.total_uses, 0) < p.max_uses)
			  AND (p.max_uses_per_user IS NULL OR u.cnt < p.max_uses_per_user)
			RETURNING p.id
		)
		INSERT INTO promo_code_redemptions
			(promo_code_id, code, user_id, discount_amount, status, updated_at, created_at)
		SELECT ${promoCodeId}, ${input.code}, ${userId}, ${amount}, 'applied', now(), now()
		FROM reserved
		RETURNING id
	`)) as DrizzleRows;

	const id = result.rows?.[0]?.id;
	return id === undefined || id === null ? null : String(id);
}

/** Привязывает уже зарезервированную активацию к созданному заказу. */
export async function attachRedemptionToOrder(
	payload: Payload,
	redemptionId: string,
	orderId: string,
): Promise<void> {
	await payload.db.drizzle.execute(sql`
		UPDATE promo_code_redemptions
		SET order_id = ${Number(orderId)}, updated_at = now()
		WHERE id = ${Number(redemptionId)}
	`);
}

/**
 * Снимает резерв активации, не дошедший до заказа.
 *
 * Нужен ровно для одного случая: активацию списали, а создание заказа упало.
 * Без него такой сбой навсегда «съедал» бы одну активацию промокода — и у
 * кода с лимитом в 100 штук лимит тихо таял бы при каждой ошибке базы.
 */
export async function revokeRedemptionById(
	payload: Payload,
	redemptionId: string,
	reason: string,
): Promise<void> {
	await payload.db.drizzle.execute(sql`
		WITH revoked AS (
			UPDATE promo_code_redemptions
			SET status = 'revoked',
			    revoked_at = now(),
			    revoke_reason = ${reason},
			    updated_at = now()
			WHERE id = ${Number(redemptionId)} AND status = 'applied'
			RETURNING promo_code_id, discount_amount
		)
		UPDATE promo_codes p
		SET total_uses = GREATEST(COALESCE(p.total_uses, 0) - 1, 0),
		    total_discount_amount = GREATEST(COALESCE(p.total_discount_amount, 0) - r.discount_amount, 0),
		    updated_at = now()
		FROM revoked r
		WHERE p.id = r.promo_code_id
	`);
}

/**
 * Возвращает активации в лимит промокода при отмене заказа.
 *
 * Идемпотентна: повторный вызов не находит записей со статусом `applied` и
 * потому ничего не меняет. Это важно, потому что отмена заказа может
 * прилететь и из личного кабинета, и из админки, и из скрипта — а счётчик
 * обязан уменьшиться ровно один раз.
 *
 * `GREATEST(..., 0)` — страховка от ухода счётчика в минус, если история
 * активаций и счётчик когда-либо разойдутся (ручная правка в БД,
 * восстановление из бэкапа): отрицательное число активаций не значит ничего
 * и ломало бы проверку лимита.
 *
 * @returns сколько активаций погашено.
 */
export async function revokeRedemptionsForOrder(
	payload: Payload,
	orderId: string,
	reason: string,
): Promise<number> {
	const result = (await payload.db.drizzle.execute(sql`
		WITH revoked AS (
			UPDATE promo_code_redemptions
			SET status = 'revoked',
			    revoked_at = now(),
			    revoke_reason = ${reason},
			    updated_at = now()
			WHERE order_id = ${Number(orderId)} AND status = 'applied'
			RETURNING promo_code_id, discount_amount
		),
		totals AS (
			SELECT promo_code_id, COUNT(*)::int AS cnt, SUM(discount_amount) AS amount
			FROM revoked
			GROUP BY promo_code_id
		)
		UPDATE promo_codes p
		SET total_uses = GREATEST(COALESCE(p.total_uses, 0) - t.cnt, 0),
		    total_discount_amount = GREATEST(COALESCE(p.total_discount_amount, 0) - t.amount, 0),
		    updated_at = now()
		FROM totals t
		WHERE p.id = t.promo_code_id
		RETURNING t.cnt
	`)) as DrizzleRows;

	return (result.rows ?? []).reduce((sum, row) => sum + toNumber(row.cnt), 0);
}
