export function validateInn(rawTaxNumber: string): string | null {
  const inn = rawTaxNumber.trim().replace(/\s/g, "");

  if (!inn) return "Укажите ИНН";
  if (!/^\d+$/.test(inn)) return "ИНН должен содержать только цифры";
  if (inn.length !== 10 && inn.length !== 12)
    return "ИНН должен содержать 10 или 12 цифр";

  const checksum = (weights: number[], digits: string) =>
    (weights.reduce((sum, w, i) => sum + w * Number(digits[i]), 0) % 11) % 10;

  if (inn.length === 10) {
    const expected = checksum([2, 4, 10, 3, 5, 9, 4, 6, 8], inn);
    if (expected !== Number(inn[9])) return "Неверная контрольная сумма ИНН";
  } else {
    const c1 = checksum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8], inn);
    const c2 = checksum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8], inn);
    if (c1 !== Number(inn[10]) || c2 !== Number(inn[11]))
      return "Неверная контрольная сумма ИНН";
  }

  return null;
}
