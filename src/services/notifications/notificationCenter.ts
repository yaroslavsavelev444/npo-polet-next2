import type { BasePayload } from "payload";
import type { NotificationType } from "../../modules/notifications/types.ts";

/**
 * Единая точка создания ВНУТРИСАЙТОВЫХ (in-app, коллекция `notifications`)
 * уведомлений — аналог того, чем для писем уже служат файлы
 * src/services/notifications/notify*.ts, только для бэлла в шапке, а не
 * почты. Оба канала осознанно независимы (см. README ниже) и вызываются
 * рядом друг с другом из одной и той же точки интеграции (хук коллекции,
 * Server Action) — так что у каждого бизнес-события ровно одно место,
 * которое решает, что при нём происходит.
 *
 * Любое место в приложении, которое хочет создать уведомление, обязано
 * идти через notify() с одним из сценариев ниже, а не звать
 * payload.create({collection:'notifications', ...}) напрямую — это и есть
 * "централизованный механизм": один каталог формулировок, один тип на
 * сценарий, one place to look когда нужно поменять текст уведомления или
 * добавить новый повод его создать.
 */

export type NotificationScenario =
  | "login_new_device"
  | "password_changed"
  | "account_locked"
  | "account_blocked"
  | "account_suspended"
  | "account_reactivated"
  | "profile_updated"
  | "order_created"
  | "order_status_changed"
  | "order_cancelled"
  | "review_approved"
  | "review_rejected"
  | "review_invitation"
  | "welcome";

interface ScenarioDataMap {
  login_new_device: { deviceLabel: string; ip: string };
  password_changed: Record<string, never>;
  account_locked: { minutesLeft: number };
  account_blocked: Record<string, never>;
  account_suspended: Record<string, never>;
  account_reactivated: Record<string, never>;
  profile_updated: Record<string, never>;
  order_created: { orderNumber: string; itemsCount: number };
  order_status_changed: { orderNumber: string; status: string };
  order_cancelled: { orderNumber: string; initiatedBy: "customer" | "admin" };
  review_approved: { productTitle: string; productUrl: string };
  review_rejected: {
    productTitle: string;
    productUrl: string;
    reason?: string | null;
  };
  review_invitation: { orderNumber: string; productCount: number };
  welcome: Record<string, never>;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  confirmed: "подтверждён",
  processing: "в обработке",
  shipped: "отправлен",
  delivered: "доставлен",
};

interface CatalogEntry<S extends NotificationScenario> {
  type: NotificationType;
  build: (data: ScenarioDataMap[S]) => {
    title: string;
    body: string;
    link?: string;
  };
}

const CATALOG: { [S in NotificationScenario]: CatalogEntry<S> } = {
  login_new_device: {
    type: "login_from_new_device",
    build: ({ deviceLabel, ip }) => ({
      title: "Вход в аккаунт",
      body: `Выполнен вход с устройства «${deviceLabel}» (IP ${ip}). Если это не вы — смените пароль и завершите чужие сессии.`,
      link: "/profile?tab=sessions",
    }),
  },
  password_changed: {
    type: "security",
    build: () => ({
      title: "Пароль изменён",
      body: "Пароль вашего аккаунта был успешно изменён.",
      link: "/profile",
    }),
  },
  account_locked: {
    type: "security",
    build: ({ minutesLeft }) => ({
      title: "Аккаунт временно заблокирован",
      body: `Слишком много неудачных попыток входа. Повторите попытку через ${minutesLeft} мин.`,
    }),
  },
  account_blocked: {
    type: "account",
    build: () => ({
      title: "Аккаунт заблокирован",
      body: "Ваш аккаунт заблокирован администратором. Обратитесь в поддержку для уточнения причины.",
      link: "/contacts",
    }),
  },
  account_suspended: {
    type: "account",
    build: () => ({
      title: "Аккаунт приостановлен",
      body: "Ваш аккаунт временно приостановлен администратором. Обратитесь в поддержку.",
      link: "/contacts",
    }),
  },
  account_reactivated: {
    type: "account",
    build: () => ({
      title: "Аккаунт снова активен",
      body: "Блокировка вашего аккаунта снята, доступ восстановлен в полном объёме.",
    }),
  },
  profile_updated: {
    type: "account",
    build: () => ({
      title: "Данные профиля обновлены",
      body: "Изменения в вашем профиле успешно сохранены.",
      link: "/profile",
    }),
  },
  order_created: {
    type: "order",
    build: ({ orderNumber, itemsCount }) => ({
      title: `Заказ №${orderNumber} оформлен`,
      body: `Приняли ваш заказ из ${itemsCount} ${pluralizeItems(itemsCount)}. Следите за статусом здесь.`,
      link: `/orders/${orderNumber}`,
    }),
  },
  order_status_changed: {
    type: "order",
    build: ({ orderNumber, status }) => ({
      title: `Заказ №${orderNumber}`,
      body: `Статус заказа изменён: ${ORDER_STATUS_LABELS[status] ?? status}.`,
      link: `/orders/${orderNumber}`,
    }),
  },
  order_cancelled: {
    type: "order",
    build: ({ orderNumber, initiatedBy }) => ({
      title: `Заказ №${orderNumber} отменён`,
      body:
        initiatedBy === "admin"
          ? "Заказ отменён администратором. Подробности уточните в поддержке."
          : "Заказ отменён по вашему запросу.",
      link: `/orders/${orderNumber}`,
    }),
  },
  review_approved: {
    type: "review",
    build: ({ productTitle, productUrl }) => ({
      title: "Отзыв опубликован",
      body: `Ваш отзыв на «${productTitle}» прошёл модерацию и опубликован.`,
      link: productUrl,
    }),
  },
  review_rejected: {
    type: "review",
    build: ({ productTitle, productUrl, reason }) => ({
      title: "Отзыв отклонён",
      body: reason
        ? `Отзыв на «${productTitle}» отклонён: ${reason}`
        : `Отзыв на «${productTitle}» не прошёл модерацию.`,
      link: productUrl,
    }),
  },
  /**
   * Приглашение оценить полученные товары.
   *
   * Отдельный сценарий, а не приписка к order_status_changed, и это
   * принципиально: то уведомление отвечает на вопрос «где мой заказ», это —
   * просьба об услуге. Смешав их, мы получили бы либо просьбу, которую никто
   * не заметит в строке про статус, либо строку про статус, в которой
   * зачем-то торгуют.
   *
   * Ведёт сразу в раздел «Можно оценить», а не на общую страницу отзывов:
   * приглашение обязано открывать список, ради которого его и отправили.
   *
   * Создаётся ТОЛЬКО когда есть что оценивать — проверку делает вызывающий
   * (см. inviteToReviewDeliveredOrder), потому что только он знает состав
   * заказа. Каталог формулировок за наличие повода не отвечает.
   *
   * Канал только внутрисайтовый. Письмо с тем же содержанием документы на
   * /consents прямо запрещают — разбор в шапке inviteToReviewDeliveredOrder.
   */
  review_invitation: {
    type: "review",
    build: ({ orderNumber, productCount }) => ({
      title: "Расскажите о покупке",
      body:
        productCount === 1
          ? `Заказ №${orderNumber} доставлен — можно оценить товар из него. Отзывы покупателей помогают тем, кто только выбирает.`
          : `Заказ №${orderNumber} доставлен — можно оценить ${productCount} ${pluralizeProducts(productCount)} из него. Отзывы покупателей помогают тем, кто только выбирает.`,
      link: "/profile/reviews?status=to-review",
    }),
  },
  welcome: {
    type: "system",
    build: () => ({
      title: "Добро пожаловать в НПО Полёт!",
      body: "Спасибо за регистрацию. Здесь будут появляться уведомления о заказах, отзывах и активности аккаунта.",
      link: "/profile",
    }),
  },
};

/**
 * «оценить 2 товара» — винительный падеж.
 *
 * Отдельно от pluralizeItems ниже, и это не дублирование: та форма стоит
 * после предлога «из» и потому родительная («заказ из 2 товаров»). Одна
 * функция на оба места давала бы «оценить 2 товаров».
 */
function pluralizeProducts(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "товаров";
  if (mod10 === 1) return "товар";
  if (mod10 >= 2 && mod10 <= 4) return "товара";
  return "товаров";
}

function pluralizeItems(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "товара";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "товаров";
  return "товаров";
}

/**
 * Создаёт in-app уведомление по одному из типизированных сценариев.
 * Никогда не бросает — создание уведомления не должно ронять бизнес-флоу
 * (регистрацию, смену пароля, обновление заказа), в этом она следует тому
 * же принципу, что и notify*.ts для писем.
 */
export async function notify<S extends NotificationScenario>(
  payload: BasePayload,
  userId: string | number,
  scenario: S,
  data: ScenarioDataMap[S],
): Promise<void> {
  try {
    const entry = CATALOG[scenario];
    const { title, body, link } = entry.build(data);

    await payload.create({
      collection: "notifications",
      data: {
        user: Number(userId),
        type: entry.type,
        title,
        body,
        link: link ?? null,
        data: data as Record<string, unknown>,
        isRead: false,
      },
      overrideAccess: true,
    });
  } catch (err) {
    console.error(`[notificationCenter] Не удалось создать уведомление (${scenario})`, err);
  }
}
