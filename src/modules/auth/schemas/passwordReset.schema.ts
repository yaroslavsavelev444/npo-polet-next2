import { z } from 'zod'

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
      .min(8, 'Пароль минимум 8 символов')
      .regex(/[A-Za-z]/, 'Пароль должен содержать буквы')
      .regex(/[0-9]/, 'Пароль должен содержать цифры'),

    confirmPassword: z.string().min(1, 'Подтвердите пароль'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  })

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>