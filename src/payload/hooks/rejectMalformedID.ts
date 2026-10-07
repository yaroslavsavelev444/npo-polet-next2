// src/payload/hooks/rejectMalformedID.ts
import { type CollectionBeforeOperationHook, NotFound } from "payload";

/**
 * Нечисловой id в адресе REST — 404, а не 500 с SQL в журнале ошибок.
 *
 * Payload сам превращает сегмент `/api/<коллекция>/<id>` в число через
 * parseFloat и не проверяет результат: на `/api/products/statuses` (так ходят
 * сканеры) в Postgres уходит `where id = NaN`, база отвечает
 * «invalid input syntax for type integer», и наружу — 500 и письмо дежурному.
 * Ключи у всех коллекций — serial, поэтому всё, что не целое положительное
 * число, документом быть не может: отвечаем так же, как на несуществующий id.
 *
 * Строки из цифр пропускаем — Local API и связи иногда передают id строкой,
 * и Postgres приводит их сам.
 */
export const rejectMalformedID: CollectionBeforeOperationHook = ({
	args,
	req,
}) => {
	const id = (args as { id?: unknown }).id;
	if (id === undefined || id === null) return args;

	const valid =
		typeof id === "number"
			? Number.isSafeInteger(id) && id > 0
			: typeof id === "string" && /^[1-9]\d{0,15}$/.test(id);

	if (!valid) throw new NotFound(req.t);
	return args;
};
