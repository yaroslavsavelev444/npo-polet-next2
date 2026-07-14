/**
 * Единый источник правды для правил пароля — переиспользуется и в zod-схемах
 * (register.schema.ts, passwordReset.schema.ts), и в клиентском индикаторе
 * требований (PasswordStrengthMeter), чтобы то, что показывает UI в реальном
 * времени, никогда не расходилось с тем, что реально проверяет сервер.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

export const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
export const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
export const PASSWORD_DIGIT_REGEX = /[0-9]/;
export const PASSWORD_SPECIAL_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/;

export type PasswordRequirementKey =
  | "length"
  | "uppercase"
  | "lowercase"
  | "digit"
  | "special";

export interface PasswordRequirement {
  key: PasswordRequirementKey;
  label: string;
  met: boolean;
}

const REQUIREMENT_DEFS: Array<{
  key: PasswordRequirementKey;
  label: string;
  test: (password: string) => boolean;
}> = [
  {
    key: "length",
    label: `От ${PASSWORD_MIN_LENGTH} до ${PASSWORD_MAX_LENGTH} символов`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH && p.length <= PASSWORD_MAX_LENGTH,
  },
  {
    key: "uppercase",
    label: "Заглавная буква (A-Z)",
    test: (p) => PASSWORD_UPPERCASE_REGEX.test(p),
  },
  {
    key: "lowercase",
    label: "Строчная буква (a-z)",
    test: (p) => PASSWORD_LOWERCASE_REGEX.test(p),
  },
  {
    key: "digit",
    label: "Цифра (0-9)",
    test: (p) => PASSWORD_DIGIT_REGEX.test(p),
  },
  {
    key: "special",
    label: "Спецсимвол (!@#$%…)",
    test: (p) => PASSWORD_SPECIAL_REGEX.test(p),
  },
];

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return REQUIREMENT_DEFS.map(({ key, label, test }) => ({
    key,
    label,
    met: test(password),
  }));
}

export type PasswordStrengthLevel = "empty" | "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
  metCount: number;
  total: number;
  level: PasswordStrengthLevel;
  label: string;
}

const LEVEL_BY_MET_COUNT: Record<number, { level: PasswordStrengthLevel; label: string }> = {
  0: { level: "empty", label: "" },
  1: { level: "weak", label: "Слабый" },
  2: { level: "fair", label: "Средний" },
  3: { level: "good", label: "Хороший" },
  4: { level: "strong", label: "Надёжный" },
  5: { level: "strong", label: "Надёжный" },
};

export function getPasswordStrength(password: string): PasswordStrength {
  const requirements = getPasswordRequirements(password);
  const metCount = requirements.filter((r) => r.met).length;
  const { level, label } = LEVEL_BY_MET_COUNT[metCount];
  return { metCount, total: requirements.length, level, label };
}
