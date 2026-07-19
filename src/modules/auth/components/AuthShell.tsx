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

/**
 * Split-screen оболочка страниц входа/регистрации.
 *
 * Слева — форма (передаётся как children), справа — изображение из админки.
 * На мобильных изображение полностью скрыто, остаётся только форма.
 *
 * Геометрия:
 *  - Компонент рендерится внутри общего layout (frontend), у которого есть
 *    фиксированная шапка (--sticky-header-height) и внешний отступ p-l
 *    (--responsive-space-l). Мы «выходим» из этого отступа отрицательными
 *    полями тем же токеном, чтобы split-screen занял ровно оставшийся первый
 *    экран: header + shell = 100svh, из-за чего футер оказывается ниже сгиба
 *    и не виден без прокрутки.
 *  - Используем svh (small viewport height), чтобы на мобильных панель
 *    браузера не «съедала» высоту и футер гарантированно не подглядывал.
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
        marginTop: "calc(-1 * var(--responsive-space-l))",
        marginBottom: "calc(-1 * var(--responsive-space-l))",
        minHeight: "calc(100svh - var(--sticky-header-height))",
      }}
      className="flex"
    >
      {/* Левая колонка — форма. m-auto (а не justify-center) центрирует форму по
          вертикали, но при нехватке высоты позволяет прокрутить её целиком, не
          обрезая верх (известная особенность flexbox + overflow). */}
      <div className="flex w-full flex-col overflow-y-auto px-6 py-10 sm:px-10 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="m-auto w-full max-w-md">{children}</div>
      </div>

      {/* Правая колонка — изображение (скрыта на мобильных) */}
      <div className="relative hidden lg:block lg:w-1/2">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            sizes="50vw"
            quality={85}
            priority
            className="object-cover"
          />
        ) : (
          <AuthImagePlaceholder variant={variant} />
        )}
        {/* Мягкое затемнение по левому краю — стык с формой без резкой границы */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, var(--background) 0%, rgba(26,29,36,0) 12%)",
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
