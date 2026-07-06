export interface EmailAddress {
  email: string;
  name?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Контракт шаблона письма. `render` — чистая функция: без I/O, без знания
 * о Payload/SMTP. `locale` зашит в данные с дефолтом 'ru' — так добавление
 * второго языка в будущем не потребует менять сигнатуру шаблонов.
 */
export interface EmailTemplate<TData> {
  id: string;
  render: (data: TData) => RenderedEmail;
}

export interface SendEmailOptions {
  to: EmailAddress | EmailAddress[];
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  attempts: number;
}

export type SupportedLocale = "ru" | "en";
