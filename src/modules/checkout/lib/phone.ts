// ─── Russian phone number: masking, normalization, validation ─────────────────
// Canonical stored/submitted format is E.164: +7XXXXXXXXXX (11 digits after "+").

export const RU_PHONE_E164_RE = /^\+7\d{10}$/;

/** Extracts up to 11 digits, normalizing the leading digit to "7" (8XXX / 9XXX). */
function extractDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  else if (digits.startsWith("9")) digits = `7${digits}`;
  else if (!digits.startsWith("7") && digits.length > 0) digits = `7${digits}`;
  return digits.slice(0, 11);
}

/** Formats raw user input into "+7 (XXX) XXX-XX-XX" as they type. */
export function formatRuPhoneInput(raw: string): string {
  const digits = extractDigits(raw);
  if (!digits) return "";

  const local = digits.slice(1);
  let result = "+7";
  if (local.length === 0) return result;

  result += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) result += ")";
  if (local.length > 3) result += ` ${local.slice(3, 6)}`;
  if (local.length > 6) result += `-${local.slice(6, 8)}`;
  if (local.length > 8) result += `-${local.slice(8, 10)}`;
  return result;
}

/** Normalizes any masked/partial input to E.164 (+7XXXXXXXXXX), or "" if incomplete. */
export function normalizeRuPhone(raw: string): string {
  const digits = extractDigits(raw);
  return digits.length === 11 ? `+${digits}` : "";
}

export function isValidRuPhone(raw: string): boolean {
  return RU_PHONE_E164_RE.test(normalizeRuPhone(raw));
}
