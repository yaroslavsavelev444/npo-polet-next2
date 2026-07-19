import Image from "next/image";
import type { ReactNode } from "react";

interface AuthShellProps {
  /** URL изображения, загруженного администратором. null → показываем заглушку. */
  imageUrl: string | null;
  /** Alt-текст изображения. */
  imageAlt: string;
  /** Левая колонка — форма (LoginForm / RegisterForm / OtpForm). */
  children: ReactNode;
  /**
   * Вариант заглушки для правой колонки, когда изображение не задано.
   * Влияет только на оттенок декоративного градиента.
   */
  variant: "login" | "register";
}

// Отступ, на который контент опускается ниже фиксированной шапки. Тот же токен,
// что используют HeaderSpacer и Hero на главной (app/(frontend)/page.tsx).
const HEADER_OFFSET =
  "calc(var(--sticky-header-height) + var(--responsive-space-l))";

/**
 * Split-screen оболочка страниц входа/регистрации.
 *
 * Слева — форма (передаётся как children), справа — изображение из админки.
 * На мобильных изображение полностью скрыто, остаётся только форма.
 *
 * Геометрия (тот же приём, что у Hero на главной):
 *  - Компонент рендерится внутри общего layout (frontend): фиксированная
 *    полупрозрачная шапка + внешний отступ p-l (--responsive-space-l) + спейсер
 *    высотой --sticky-header-height. Спейсер немного выше реальной шапки, из-за
 *    чего между шапкой и контентом появлялась полоса фона.
 *  - Поэтому оболочку поднимаем к самому верху (marginTop = -(спейсер + p-l))
 *    и растягиваем на весь экран (min-height: 100svh). Фон/изображение уходят
 *    под полупрозрачную шапку без зазора, а сам контент опускаем ниже шапки
 *    через paddingTop, чтобы он её не перекрывал. Футер оказывается за сгибом.
 *  - svh (small viewport height) — чтобы на мобильных панель браузера не
 *    «съедала» высоту и футер не подглядывал.
 */
export function AuthShell({
  imageUrl,
  imageAlt,
  children,
  variant,
}: AuthShellProps) {
  return (
    <div
      style={{
        width: "100vw",
        marginLeft: "-50vw",
        marginRight: "-50vw",
        marginTop: `calc(-1 * ${HEADER_OFFSET})`,
        minHeight: "100svh",
      }}
      className="flex"
    >
      {/* Левая колонка — форма. paddingTop опускает форму ниже шапки; m-auto (а не
          justify-center) центрирует её по вертикали, но при нехватке высоты
          позволяет прокрутить целиком, не обрезая верх (особенность flexbox). */}
      <div
        className="flex w-full flex-col overflow-y-auto px-6 pb-10 sm:px-10 lg:w-1/2 lg:px-16 xl:px-24"
        style={{ paddingTop: HEADER_OFFSET }}
      >
        <div className="m-auto w-full max-w-md">{children}</div>
      </div>

      {/* Правая колонка — изображение (скрыта на мобильных). Изображение
          показывается целиком (object-contain) — без обрезки и искажения; пустоты
          по краям заполняет размытая копия того же изображения (backdrop), чтобы
          колонка выглядела цельной при любом соотношении сторон. */}
      <div className="relative hidden overflow-hidden lg:block lg:w-1/2">
        {imageUrl ? (
          <>
            {/* Размытый фон-заполнитель */}
            <Image
              src={imageUrl}
              alt=""
              aria-hidden
              fill
              sizes="50vw"
              quality={30}
              className="scale-110 object-cover blur-2xl"
              style={{ opacity: 0.45 }}
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{ background: "var(--background)", opacity: 0.35 }}
            />
            {/* Само изображение — целиком, без обрезки */}
            <Image
              src={imageUrl}
              alt={imageAlt}
              fill
              sizes="50vw"
              quality={90}
              priority
              className="object-contain"
            />
          </>
        ) : (
          <AuthImagePlaceholder variant={variant} />
        )}
        {/* Мягкий стык с формой по левому краю */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, var(--background) 0%, rgba(26,29,36,0) 10%)",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Градиентная заглушка, когда администратор не загрузил изображение.
 * Тёмная, в тон сайта, с фирменным акцентом и деликатной сеткой.
 */
function AuthImagePlaceholder({ variant }: { variant: "login" | "register" }) {
  const accent =
    variant === "login" ? "var(--primary-600)" : "var(--accent-700)";
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{ background: "var(--surface)" }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 80% 15%, ${accent} 0%, transparent 55%), radial-gradient(90% 80% at 15% 90%, var(--primary-900) 0%, transparent 60%)`,
          opacity: 0.55,
        }}
      />
      {/* Тонкая сетка */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(var(--border-light) 1px, transparent 1px), linear-gradient(90deg, var(--border-light) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.06,
        }}
      />
      {/* Крупная монограмма НПО «Полёт» */}
      <div className="absolute inset-0 flex items-center justify-center px-10">
        <span
          className="select-none whitespace-nowrap font-semibold tracking-tight"
          style={{
            fontSize: "clamp(2.5rem, 5.5vw, 5rem)",
            color: "var(--text-primary)",
            opacity: 0.09,
          }}
        >
          НПО&nbsp;Полёт
        </span>
      </div>
    </div>
  );
}
