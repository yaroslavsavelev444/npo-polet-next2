// components/layout/Footer.tsx

import Image from "next/image";
import Link from "next/link";
import { getCachedConsents } from "@/payload/services/consents.service";
import { getCachedSettings } from "@/payload/services/settings.service";
import type { Consent } from "@/payload-types";
import {
  getCompanyName,
  getLegalAddress,
  getLogoUrl,
  getPrimaryEmail,
  getPrimaryPhone,
  getSocialLinks,
} from "@/utils/settings-helpers";

export interface FooterColumn {
  title: string;
  links: { label: string; path: string; external?: boolean }[];
}

export interface FooterProps {
  columns?: FooterColumn[];
  showBackToTop?: boolean;
  className?: string;
}

const DEFAULT_COLUMNS: FooterColumn[] = [
  {
    title: "Товары",
    links: [
      { label: "Категории", path: "/category" },
      { label: "Все товары", path: "/category/all" },
    ],
  },
  {
    title: "Ресурсы",
    links: [
      { label: "FAQ", path: "/faq" },
      { label: "База знаний", path: "/knowledge" },
    ],
  },
  {
    title: "О проекте",
    links: [
      { label: "Контакты", path: "/contacts" },
      { label: "Соглашения", path: "/consents" },
    ],
  },
  {
    title: "Личный кабинет",
    links: [
      { label: "Профиль", path: "/profile" },
      { label: "Мои отзывы", path: "/my-reviews" },
      { label: "Избранное", path: "/wishlist" },
    ],
  },
];

export default async function Footer({
  columns = DEFAULT_COLUMNS,
  showBackToTop = true,
  className = "",
}: FooterProps) {
  // Получаем настройки и соглашения параллельно
  const [settings, consentsResult] = await Promise.all([
    getCachedSettings(),
    getCachedConsents({ isActive: true, sort: "title" }),
  ]);

  const companyName = getCompanyName(settings);
  const logoUrl = getLogoUrl(settings);
  const phone = getPrimaryPhone(settings);
  const email = getPrimaryEmail(settings);
  const socialLinks = getSocialLinks(settings);
  const legalAddress = getLegalAddress(settings);

  // Строим ссылки на соглашения для нижней части
  const consentLinks = (consentsResult?.docs || []).map((consent: Consent) => ({
    label: consent.title,
    path: `/consents/${consent.slug}`,
  }));

  // Если соглашений нет, используем запасные ссылки (как в старом проекте)
  const bottomLinks =
    consentLinks.length > 0
      ? consentLinks
      : [
          { label: "Политика конфиденциальности", path: "/consents/privacy" },
          { label: "Правила продажи товаров", path: "/consents/terms" },
          {
            label: "Пользовательское соглашение",
            path: "/consents/user-agreement",
          },
          { label: "Публичная оферта", path: "/consents/offer" },
          { label: "Файлы куки", path: "/consents/cookie" },
          {
            label: "Согласие на обработку данных",
            path: "/consents/personal-data",
          },
        ];

  return (
    <footer className={`w-full bg-black text-gray-300  ${className}`}>
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
        {/* Верхняя часть: логотип и контакты по центру */}
        <div className="flex flex-col items-center text-center">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={companyName || "Логотип"}
              width={180}
              height={48}
              className="h-12 w-auto"
              priority
            />
          ) : (
            <span className="text-2xl font-bold text-white">
              {companyName || "Название компании"}
            </span>
          )}

          <div className="mt-4 space-x-4 text-sm">
            {phone && (
              <a
                href={`tel:${phone}`}
                className="hover:text-primary transition"
              >
                {phone}
              </a>
            )}
            {email && (
              <>
                <span className="text-gray-500">•</span>
                <a
                  href={`mailto:${email}`}
                  className="hover:text-primary transition"
                >
                  {email}
                </a>
              </>
            )}
          </div>

          {/* Социальные сети (если есть) — в старом проекте не было, но оставим на случай */}
          {socialLinks.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-4 justify-center">
              {socialLinks.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-primary transition text-sm"
                >
                  {link.platform}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Сетка колонок */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {columns.map((col, idx) => (
            <div key={idx}>
              <h3 className="text-white font-semibold text-lg mb-4">
                {col.title}
              </h3>
              <ul className="space-y-2">
                {col.links.map((link, i) => (
                  <li key={i}>
                    <Link
                      href={link.path}
                      className="text-gray-400 hover:text-primary transition text-sm"
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noopener noreferrer" : undefined}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Разделитель */}
        <hr className="my-12 border-border/30" />

        {/* Нижняя часть: юр.информация слева, соглашения и наверх справа */}
        <div className="flex flex-col md:flex-row justify-between items-start gap-4 text-sm">
          <div className="space-y-1 text-gray-500">
            {companyName && <p className="text-gray-400">{companyName}</p>}
            {legalAddress && <p>{legalAddress}</p>}
            {/* При желании можно добавить ИНН/ОГРН из настроек, если они будут добавлены в модель */}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {bottomLinks.map((link, idx) => (
              <Link
                key={idx}
                href={link.path}
                className="text-gray-500 hover:text-primary transition text-xs sm:text-sm whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}
            {showBackToTop && (
              <a
                href="#top"
                className="inline-flex items-center gap-1 text-gray-500 hover:text-primary transition ml-2"
              >
                <span>Наверх</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 15l7-7 7 7"
                  />
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
