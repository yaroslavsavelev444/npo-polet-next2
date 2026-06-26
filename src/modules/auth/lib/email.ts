import { Resend } from 'resend'
import type { OtpType } from '../types'
import { env } from '@/env'
import { logOtpDev } from './utils'
const resend = new Resend(env.RESEND_API_KEY)

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'noreply@example.com'
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Приложение'

// ─── OTP письма ───────────────────────────────────────────────────────────────

interface SendOtpEmailParams {
  to: string
  otp: string
  type: OtpType
}

export async function sendOtpEmail({ to, otp, type }: SendOtpEmailParams) {
  const subject =
    type === 'email_verify'
      ? `Подтверждение email — ${APP_NAME}`
      : `Код входа — ${APP_NAME}`

  const heading =
    type === 'email_verify' ? 'Подтвердите ваш email' : 'Код для входа'

  const description =
    type === 'email_verify'
      ? 'Для завершения регистрации введите код:'
      : 'Для входа в аккаунт введите код:'


      if (env.NODE_ENV === 'development') {

  logOtpDev({ email: to, otp, type })

  return

}
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html: buildOtpEmailHtml({ heading, description, otp }),
  })
}

// ─── HTML шаблоны ─────────────────────────────────────────────────────────────

function buildOtpEmailHtml({
  heading,
  description,
  otp,
}: {
  heading: string
  description: string
  otp: string
}) {
  return `
    <!DOCTYPE html>
    <html lang="ru">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${heading}</title>
      </head>
      <body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#f4f5f7;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
          <tr>
            <td align="center">
              <table width="480" cellpadding="0" cellspacing="0"
                style="background:#fff;border-radius:12px;padding:40px;max-width:100%;">
                <tr>
                  <td>
                    <h1 style="margin:0 0 8px;font-size:24px;color:#111;">${heading}</h1>
                    <p style="margin:0 0 32px;color:#555;font-size:16px;">${description}</p>
                    <div style="
                      background:#f4f5f7;
                      border-radius:8px;
                      padding:24px;
                      text-align:center;
                      letter-spacing:12px;
                      font-size:36px;
                      font-weight:700;
                      color:#111;
                      font-family:monospace;
                      margin-bottom:32px;
                    ">${otp}</div>
                    <p style="margin:0;color:#888;font-size:14px;line-height:1.5;">
                      Код действителен 10 минут.<br/>
                      Если вы не запрашивали код — проигнорируйте это письмо.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
}