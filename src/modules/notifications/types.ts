/**
 * Общие типы модуля уведомлений — импортируются и сервером (API-роуты,
 * notificationCenter), и клиентом (React Query хуки, компоненты), поэтому
 * файл не должен тянуть ничего server-only (Payload, next/headers и т.п.).
 *
 * Значения NotificationType — зеркало поля `type` коллекции Notifications
 * (см. src/payload/collections/Notifications.ts). Дублирование неизбежно:
 * Payload описывает select-опции строковым литералом на этапе конфигурации
 * коллекции, а не экспортирует переиспользуемый TS-тип, который можно было
 * бы импортировать сюда напрямую.
 */
export type NotificationType =
  | "system"
  | "subscription_match"
  | "chat"
  | "review"
  | "order"
  | "promotion"
  | "discount"
  | "product"
  | "login_from_new_device"
  | "security"
  | "account";

export interface NotificationDTO {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsPageResponse {
  items: NotificationDTO[];
  nextCursor: number | null;
  totalDocs: number;
  /**
   * Актуальный счётчик непрочитанных ПОСЛЕ обработки этой страницы (см.
   * логику авто-прочтения в app/api/notifications/route.ts). Позволяет
   * синхронизировать бейдж без отдельного запроса к unread-count.
   */
  unreadCount: number;
}

export interface MarkReadResponse {
  updated: number;
  unreadCount: number;
}
