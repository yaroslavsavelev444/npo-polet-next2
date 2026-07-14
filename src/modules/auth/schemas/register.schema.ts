import { z } from "zod";
import {
  PASSWORD_DIGIT_REGEX,
  PASSWORD_LOWERCASE_REGEX,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_SPECIAL_REGEX,
  PASSWORD_UPPERCASE_REGEX,
} from "../lib/passwordPolicy";

export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, "Email обязателен")
      .email("Некорректный email")
      .toLowerCase(),

    // Регексы и границы длины — из lib/passwordPolicy.ts, того же источника,
    // что использует PasswordStrengthMeter на клиенте, чтобы индикатор
    // требований никогда не расходился с тем, что реально проверяет сервер.
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Пароль минимум ${PASSWORD_MIN_LENGTH} символов`)
      .max(PASSWORD_MAX_LENGTH, `Пароль не более ${PASSWORD_MAX_LENGTH} символов`)
      .regex(PASSWORD_UPPERCASE_REGEX, "Пароль должен содержать заглавную букву")
      .regex(PASSWORD_LOWERCASE_REGEX, "Пароль должен содержать строчную букву")
      .regex(PASSWORD_DIGIT_REGEX, "Пароль должен содержать цифру")
      .regex(PASSWORD_SPECIAL_REGEX, "Пароль должен содержать специальный символ"),

    confirmPassword: z.string().min(1, "Подтвердите пароль"),

    name: z
      .string()
      .min(2, "Имя минимум 2 символа")
      .max(60, "Имя не более 60 символов")
      .regex(/^[a-zA-Zа-яёА-ЯЁ\s\-']+$/, "Имя содержит недопустимые символы"),

    // Массив принятых согласий передаётся как JSON-строка из FormData
    consentsJson: z.string().min(1, "Необходимо принять соглашения"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

// Схема для одного принятого согласия
export const acceptedConsentSchema = z.object({
  consentId: z.coerce.number(),

  slug: z.string(),

  version: z.string(),
});

export type AcceptedConsentInput = z.infer<typeof acceptedConsentSchema>;
