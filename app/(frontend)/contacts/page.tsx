import type { Metadata } from "next";
import {
  CompanyDetails,
  ContactFormSection,
  ContactHero,
  NetworkSection,
  SaveContactBar,
} from "@/modules/contact";
import { bySortOrder, primaryOf } from "@/modules/contact/lib/format";
import { getCachedSettings } from "@/payload/services/settings.service";
import { baseURL } from "@/resources/content";
import { JsonLd } from "@/shared/components/JsonLd";
import { buildContactPageSchema } from "@/shared/lib/seo/schema";

const PAGE_PATH = "/contacts";
const PAGE_URL = `${baseURL}${PAGE_PATH}`;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCachedSettings();
  const company = settings?.companyName ?? "НПО «Полёт»";

  const title = "Контакты";
  const description = `Телефоны, почта и адреса ${company}. Свяжитесь с менеджером — ответим в течение рабочего дня.`;

  return {
    title,
    description,
    alternates: { canonical: PAGE_URL },
    openGraph: {
      title,
      description,
      url: PAGE_URL,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/**
 * Страница контактов.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОРЯДОК СЕКЦИЙ
 * ────────────────────────────────────────────────────────────────────────────
 *  1. Прямые каналы — телефон и почта сразу, без прокрутки. Тот, кто дошёл до
 *     страницы контактов, уже решил связаться; заставлять его листать до
 *     номера — верный способ потерять именно тех, кто готов звонить.
 *  2. Форма — для всех остальных: кому нужно описать задачу словами, кто пишет
 *     вечером или не хочет звонить вовсе.
 *  3. Реквизиты и карта — для тех, кто оформляет договор или едет.
 *  4. Мессенджеры — короткий вопрос.
 *  5. Сохранить контакт — служебное действие, поэтому последнее и самое тихое.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДАННЫЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Всё содержимое приходит из глобала `settings` Payload — одним запросом,
 * кэшированным по тегу и сбрасываемым хуками админки. Структура объекта
 * контактов не меняется: страница только по-другому его показывает.
 *
 * Страница остаётся осмысленной и при пустых настройках: каждая секция сама
 * решает, показываться ли ей (пустой блок соцсетей ничему не помогает), а
 * форма работает независимо от того, заполнены ли телефоны.
 */
export default async function ContactsPage() {
  const settings = await getCachedSettings();

  if (!settings) {
    // Глобал не заполнен вовсе — единственный работающий канал связи в этом
    // случае форма, и показать её честнее, чем пустую страницу. Прежняя
    // версия возвращала null, то есть белый экран под шапкой.
    return (
      <div
        className="full-bleed"
        style={{
          marginTop: "calc(-1 * var(--responsive-space-l))",
          marginBottom: "calc(-1 * var(--responsive-space-l))",
        }}
      >
        <ContactFormSection />
      </div>
    );
  }

  const phones = bySortOrder(settings.phones);
  const emails = bySortOrder(settings.emails);
  const schema = buildContactPageSchema(settings, PAGE_URL);

  return (
    // Общий layout витрины кладёт страницу в центрированную колонку с
    // отступом padding="l". Секциям контактов он не нужен: они сами задают и
    // ширину контента, и вертикальный ритм. .full-bleed возвращает странице
    // полную ширину окна, отрицательные поля снимают вертикальный отступ —
    // иначе над первым экраном и под подвалом остаются полосы фона.
    <div
      className="full-bleed"
      style={{
        marginTop: "calc(-1 * var(--responsive-space-l))",
        marginBottom: "calc(-1 * var(--responsive-space-l))",
      }}
    >
      <JsonLd data={schema} />

      <ContactHero settings={settings} />
      <ContactFormSection fallbackEmail={primaryOf(emails)?.value} />
      <CompanyDetails settings={settings} />
      <NetworkSection settings={settings} />
      <SaveContactBar
        companyName={settings.companyName}
        phones={phones}
        emails={emails}
        physicalAddress={settings.physicalAddress}
      />
    </div>
  );
}
