
import { About, Blog, Gallery, Home, Newsletter, Person, Social, Work } from "@/types";
import { Line, Row, Text } from "@once-ui-system/core";

// ============================================================
// Данные о компании
// ============================================================
const person: Person = {
  firstName: "СТК",
  lastName: "Актив",
  name: "СТК-Актив",
  role: "Строительно-торговая компания",
  avatar: "/images/logo.jpg",        // замените на свой логотип
  email: "info@stkaktiv.ru",
  location: "Россия, Рязань",
  languages: ["Русский"],
};

export const baseURL = "https://stkaktiv.ru";

// ============================================================
// Настройка рассылки (можно отключить)
// ============================================================
const newsletter: Newsletter = {
  display: false,
  title: <>Подписка на новости</>,
  description: <>Будьте в курсе наших новинок</>,
};

// ============================================================
// Социальные сети
// ============================================================
const social: Social = [
  {
    name: "Email",
    icon: "email",
    link: `mailto:${person.email}`,
    essential: true,
  },
  // добавьте другие, если нужно
];

// ============================================================
// Главная страница
// ============================================================
const home: Home = {
  path: "/",
  image: "/images/og/home.jpg",
  label: "Главная",
  title: "СТК-Актив – производство дорожных знаков",
  description: "Производство и поставка дорожных знаков и средств безопасности для дорог федерального значения",
  headline: <>Качество и надёжность на каждой дороге</>,
  featured: {
    display: true,
    title: (
      <Row gap="12" vertical="center">
        <strong className="ml-4">Производитель</strong>
        <Line background="brand-alpha-strong" vert height="20" />
        <Text marginRight="4" onBackground="brand-medium">
          ГОСТ 52290-2004
        </Text>
      </Row>
    ),
    href: "/work",
  },
  subline: (
    <>
      Мы производим дорожные знаки высшего качества для федеральных трасс. <br />
      Опыт поставок на М-2, М-4, М-7, М-12 и другие магистрали.
    </>
  ),
};

// ============================================================
// Страница «О компании»
// ============================================================
const about: About = {
  path: "/about",
  label: "О компании",
  title: "О компании – СТК-Актив",
  description: "История и достижения компании СТК-Актив",
  tableOfContent: {
    display: true,
    subItems: false,
  },
  avatar: {
    display: true,
  },
  calendar: {
    display: false,
    link: "",
  },
  intro: {
    display: true,
    title: "О нас",
    description: (
      <>
        Компания СТК-Актив – молодая и динамично развивающаяся компания, имеющая опыт поставки продукции
        на дороги федерального значения. Мы являемся производителями дорожных знаков и уделяем особое
        внимание качеству, стремясь предложить максимально удобные условия сделки.
        <br /><br />
        На сегодняшний день наша компания является поставщиком ведущих компаний по строительству и ремонту
        дорог как на территории Российской Федерации, так и стран ближнего зарубежья.
      </>
    ),
  },
  work: {
    display: true,
    title: "Ключевые проекты",
    experiences: [
      {
        company: "М-2 «Крым»",
        timeframe: "2023",
        role: "Поставка дорожных знаков",
        achievements: [
          <>Поставка знаков для ремонта участка Москва–Тула–Орёл–Курск–Белгород</>,
          <>Обеспечение безопасности движения в соответствии с ГОСТ</>,
        ],
        images: [
          { src: "/images/projects/m2.jpg", alt: "М-2 Крым", width: 16, height: 9 },
        ],
      },
      {
        company: "М-4 «Дон»",
        timeframe: "2023",
        role: "Поставка дорожных знаков",
        achievements: [
          <>Участок 192+000–204+000 км</>,
          <>Использование светоотражающих плёнок ORAFOL</>,
        ],
        images: [
          { src: "/images/projects/m4.jpg", alt: "М-4 Дон", width: 16, height: 9 },
        ],
      },
      {
        company: "М-7 «Волга»",
        timeframe: "2022",
        role: "Поставка дорожных знаков",
        achievements: [
          <>Москва–Владимир–Нижний Новгород–Казань–Уфа</>,
          <>Изготовление знаков больших размеров с рёбрами жёсткости</>,
        ],
        images: [
          { src: "/images/projects/m7.jpg", alt: "М-7 Волга", width: 16, height: 9 },
        ],
      },
      {
        company: "М-12 «Москва–Нижний Новгород–Казань»",
        timeframe: "2023",
        role: "Поставка дорожных знаков",
        achievements: [
          <>Новая трасса, полный комплекс дорожных знаков</>,
          <>Крепления для стоек любого диаметра</>,
        ],
        images: [
          { src: "/images/projects/m12.jpg", alt: "М-12", width: 16, height: 9 },
        ],
      },
    ],
  },
  studies: {
    display: false,
    title: "",
    institutions: [],
  },
  technical: {
    display: false,
    title: "",
    skills: [],
  },
};

// ============================================================
// Страница проектов (используется компонентом Projects)
// ============================================================
const work: Work = {
  path: "/work",
  label: "Проекты",
  title: "Наши проекты – СТК-Актив",
  description: "Реализованные поставки дорожных знаков",
  // Компонент Projects автоматически использует данные из about.work.experiences,
  // но если требуется отдельный список, можно продублировать.
};

// ============================================================
// Блог (не используется, но оставляем пустым)
// ============================================================
const blog: Blog = {
  path: "/blog",
  label: "Блог",
  title: "Блог",
  description: "",
};

// ============================================================
// Галерея (не используется)
// ============================================================
const gallery: Gallery = {
  path: "/gallery",
  label: "Галерея",
  title: "Галерея",
  description: "",
  images: [],
};

// ============================================================
// Настройки стилей и эффектов (используются в layout)
// ============================================================
export const style = {
  brand: "primary",        // соответствует data-brand
  accent: "accent",        // соответствует data-accent
  neutral: "neutral",
  solid: "solid",
  solidStyle: "flat",
  border: "rounded",
  surface: "filled",
  transition: "smooth",
  scaling: "100",
};

export const dataStyle = {
  variant: "default",
};

export const effects = {
  mask: {
    x: 0,
    y: 0,
    radius: 0,
    cursor: false,
  },
  gradient: {
    display: false,
    opacity: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    tilt: 0,
    colorStart: "",
    colorEnd: "",
  },
  dots: {
    display: false,
    opacity: 0,
    size: "1",
    color: "",
  },
  grid: {
    display: false,
    opacity: 0,
    color: "",
    width: 0,
    height: 0,
  },
  lines: {
    display: false,
    opacity: 0,
    size: "1",
    thickness: 0,
    angle: 0,
    color: "",
  },
};

export const fonts = {
  heading: { variable: "--font-heading" },
  body: { variable: "--font-body" },
  label: { variable: "--font-label" },
  code: { variable: "--font-code" },
};

// ============================================================
// Экспорт всех данных
// ============================================================
export { person, social, newsletter, home, about, blog, work, gallery };