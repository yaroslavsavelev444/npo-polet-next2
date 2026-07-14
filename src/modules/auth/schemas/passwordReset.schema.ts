import { z } from 'zod'
import {
  PASSWORD_DIGIT_REGEX,
  PASSWORD_LOWERCASE_REGEX,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_SPECIAL_REGEX,
  PASSWORD_UPPERCASE_REGEX,
} from '../lib/passwordPolicy'

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email обязателен')
    .email('Некорректный email')
    .toLowerCase(),
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Токен обязателен'),

    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Пароль минимум ${PASSWORD_MIN_LENGTH} символов`)
      .max(PASSWORD_MAX_LENGTH, `Пароль не более ${PASSWORD_MAX_LENGTH} символов`)
      .regex(PASSWORD_UPPERCASE_REGEX, 'Пароль должен содержать заглавную букву')
      .regex(PASSWORD_LOWERCASE_REGEX, 'Пароль должен содержать строчную букву')
      .regex(PASSWORD_DIGIT_REGEX, 'Пароль должен содержать цифру')
      .regex(PASSWORD_SPECIAL_REGEX, 'Пароль должен содержать специальный символ'),

    confirmPassword: z.string().min(1, 'Подтвердите пароль'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  })

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>