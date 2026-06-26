import { z } from 'zod'

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email обязателен')
    .email('Некорректный email')
    .toLowerCase(),

  password: z.string().min(1, 'Пароль обязателен'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const otpSchema = z.object({
  code: z
    .string()
    .length(6, 'Код должен содержать 6 цифр')
    .regex(/^\d{6}$/, 'Код должен содержать только цифры'),
  // Тип OTP — чтобы один action обслуживал и login_2fa, и email_verify
  type: z.enum(['login_2fa', 'email_verify']),
})

export type OtpInput = z.infer<typeof otpSchema>