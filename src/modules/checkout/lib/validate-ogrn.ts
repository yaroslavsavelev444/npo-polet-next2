/**
 * ОГРН (13 цифр, юрлицо) или ОГРНИП (15 цифр, ИП) с контрольной цифрой.
 *
 * Контрольная цифра — последняя цифра остатка от деления числа из первых
 * 12 (14) цифр на 11 (13). Число превышает Number.MAX_SAFE_INTEGER только
 * для ОГРНИП, поэтому считаем через BigInt для обоих случаев одинаково.
 *
 * Поле необязательное: пустое значение — не ошибка.
 */
export function validateOgrn(raw: string): string | null {
	const ogrn = raw.trim().replace(/\s/g, "");
	if (!ogrn) return null;
	if (!/^\d+$/.test(ogrn)) return "ОГРН должен содержать только цифры";
	if (ogrn.length !== 13 && ogrn.length !== 15)
		return "ОГРН должен содержать 13 цифр (ОГРНИП — 15)";

	const body = BigInt(ogrn.slice(0, -1));
	// Литералы 11n недоступны при target ES2017 из tsconfig.
	const divisor = BigInt(ogrn.length === 13 ? 11 : 13);
	const expected = (body % divisor) % BigInt(10);
	if (expected !== BigInt(ogrn.slice(-1))) {
		return "Неверная контрольная цифра ОГРН";
	}
	return null;
}
