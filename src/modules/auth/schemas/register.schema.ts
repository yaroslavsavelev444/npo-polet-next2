import { z } from "zod";

export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, "Email обязателен")
      .email("Некорректный email")
      .toLowerCase(),

    password: z
      .string()
      .min(8, "Пароль минимум 8 символов")
      .regex(/[A-Za-z]/, "Пароль должен содержать буквы")
      .regex(/[0-9]/, "Пароль должен содержать цифры"),

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
