'use client';

import Image from 'next/image';
import { memo, useMemo, useCallback } from 'react';
import type { ContentBlock as PayloadContentBlock } from '@/payload-types';

// ─── Типы ────────────────────────────────────────────────────────────────────

type LayoutType =
  | 'image-left'
  | 'image-right'
  | 'text-only'
  | 'image-only'
  | 'hero'
  | 'default';

type Variant = 'default' | 'featured' | 'compact';

type Props = {
  block: PayloadContentBlock;
  variant?: Variant;
  onClick?: (block: PayloadContentBlock) => void;
  className?: string;
};

// ─── SVG иконка ArrowRight (без зависимости от ant-design) ──────────────────

const ArrowRightIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

// ─── Фоллбэк-плейсхолдер (показываем только при отсутствии imageUrl) ─────────

const ImagePlaceholder = () => (
  <div className="flex h-full w-full items-center justify-center">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--text-muted)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  </div>
);

// ─── Компонент ContentBlock ──────────────────────────────────────────────────

export const ContentBlock = memo(
  ({ block, variant = 'default', onClick, className = '' }: Props) => {
    const {
      title,
      subtitle,
      description,
      image,
      button,
      tags = [],
      isActive = true,
      variant: blockVariant,
    } = block;

    // Layout берём из поля variant самого блока (из Payload CMS)
    const layout: LayoutType = (blockVariant as LayoutType) ?? 'default';

    // Извлекаем URL изображения из Payload-объекта
    const imageUrl = useMemo(() => {
      if (image && typeof image === 'object' && 'url' in image) {
        return (image as { url?: string | null }).url ?? null;
      }
      return null;
    }, [image]);

    // Флаги видимости секций
    const showImage = layout !== 'text-only' && Boolean(imageUrl);
    const showText   = layout !== 'image-only';

    // Флаг: изображение справа (текст слева)
    const isImageRight = layout === 'image-right' || layout === 'hero';

    // Нормализуем теги из массива [{tag: string}] или [string]
    const displayTags = useMemo(() => {
      return (tags as Array<{ tag?: string } | string>)
        .slice(0, 3)
        .map((t) => (typeof t === 'object' && t?.tag ? t.tag : String(t)))
        .filter(Boolean);
    }, [tags]);

    // ── Обработчики ──────────────────────────────────────────────────────────

    const handleCardClick = useCallback(() => {
      onClick?.(block);
    }, [onClick, block]);

    const handleButtonClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation(); // не поднимаем клик на карточку
        if (!button?.action) return;
        if (button.action.startsWith('http')) {
          window.open(button.action, '_blank', 'noopener,noreferrer');
        } else {
          window.location.href = button.action;
        }
      },
      [button],
    );

    // ── Производные классы ───────────────────────────────────────────────────

    // Минимальная высота карточки — одинакова для всех карточек в группе
    const cardMinHeightClass =
      variant === 'featured'
        ? 'min-h-[420px]'
        : variant === 'compact'
          ? 'min-h-[280px]'
          : 'min-h-[360px]';

    // Фиксированная высота контейнера изображения внутри карточки
    const imageHeightClass =
      variant === 'featured'
        ? 'h-[420px]'
        : variant === 'compact'
          ? 'h-[280px]'
          : 'h-[360px]';

    // Padding текстового блока
    const textPaddingClass =
      variant === 'compact'
        ? 'p-6'
        : variant === 'featured'
          ? 'p-8 md:p-10'
          : 'p-7 md:p-9';

    // Размер заголовка
    const titleSizeClass =
      variant === 'featured'
        ? 'text-2xl md:text-3xl font-bold leading-tight'
        : variant === 'compact'
          ? 'text-lg font-semibold leading-snug'
          : 'text-xl md:text-2xl font-semibold leading-snug';

    // Стиль кнопки по button.style
    const buttonVariantClass =
      button?.style === 'secondary'
        ? 'bg-[var(--surface-secondary)] text-[var(--text-primary)] hover:bg-[var(--border-light)]'
        : button?.style === 'outline'
          ? 'bg-transparent border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white'
          : /* primary (default) */
            'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]';

    // ── Рендер секции изображения ────────────────────────────────────────────

    const renderImage = () => {
      if (!showImage || !imageUrl) return null;

      return (
        <div
          className={[
            // Ширина: на мобильных — полная, на md — ровно половина карточки
            'relative flex flex-shrink-0 items-center justify-center',
            'w-full md:w-1/2',
            // Фиксированная высота — выравниваем все карточки в группе
            imageHeightClass,
            // Порядок: image-right → изображение идёт вторым (справа)
            isImageRight ? 'md:order-2' : 'md:order-1',
          ].join(' ')}
        >
          {/*
            object-contain — изображение вписывается без обрезки,
            сохраняет пропорции. Нет фона, нет scale, нет оверлея.
          */}
          <Image
            src={imageUrl}
            alt={title ?? ''}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 50vw"
          />

          {/* Бейдж «Неактивно» — только при isActive === false */}
          {!isActive && (
            <span
              className={[
                'absolute right-4 top-4 z-10',
                'rounded-[var(--radius-sm)] px-2.5 py-1',
                'bg-black/75 text-xs font-medium text-white backdrop-blur-sm',
              ].join(' ')}
            >
              Неактивно
            </span>
          )}
        </div>
      );
    };

    // ── Рендер текстового блока ──────────────────────────────────────────────

    const renderText = () => {
      if (!showText) return null;

      return (
        <div
          className={[
            // Flex-колонка, растягиваем на всю доступную ширину
            'flex flex-1 flex-col',
            // Вертикальное центрирование содержимого
            'justify-center',
            // Горизонтальное центрирование текста
            'items-center text-center',
            textPaddingClass,
            // Порядок: image-right → текст идёт первым (слева)
            isImageRight ? 'md:order-1' : 'md:order-2',
          ].join(' ')}
        >
          {/* Заголовок + подзаголовок */}
          <div className="flex w-full flex-col gap-2">
            {title && (
              <h3
                className={[
                  'text-[var(--text-primary)]',
                  'transition-colors duration-200 group-hover:text-[var(--primary-200)]',
                  titleSizeClass,
                ].join(' ')}
              >
                {title}
              </h3>
            )}

            {subtitle && (
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                {subtitle}
              </p>
            )}
          </div>

          {/* Описание: максимум 3 строки, затем многоточие */}
          {description && (
            <p className="mt-3 line-clamp-3 w-full text-sm leading-relaxed text-[var(--text-muted)]">
              {description}
            </p>
          )}

          {/*
            Нижняя часть: теги + кнопка.
            mt-auto прижимает этот блок ко дну текстового контейнера.
          */}
          {(displayTags.length > 0 || (button?.text && button.action)) && (
            <div className="mt-auto flex w-full flex-col items-center gap-3 pt-5">

              {/* Теги */}
              {displayTags.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {displayTags.map((tag, i) => (
                    <span
                      /* biome-ignore lint/suspicious/noArrayIndexKey: теги стабильны */
                      key={`${tag}-${i}`}
                      className={[
                        'inline-flex items-center rounded-[var(--radius-sm)]',
                        'border border-[var(--border-light)] bg-[var(--surface-secondary)]',
                        'px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]',
                        'transition-colors duration-200',
                        'hover:border-[var(--primary-400)] hover:text-[var(--primary-200)]',
                      ].join(' ')}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Кнопка — прижата к низу, кастомный стиль из button.style */}
              {button?.text && button.action && (
                <button
                  type="button"
                  onClick={handleButtonClick}
                  className={[
                    'inline-flex w-fit items-center gap-2',
                    'rounded-[var(--radius-md)] px-5 py-2.5',
                    'text-sm font-semibold',
                    'transition-all duration-200',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                    'focus-visible:outline-[var(--primary)]',
                    buttonVariantClass,
                  ].join(' ')}
                >
                  {button.text}
                  <ArrowRightIcon />
                </button>
              )}
            </div>
          )}
        </div>
      );
    };

    // ── Основной рендер ──────────────────────────────────────────────────────

    return (
      <article
        className={[
          // Горизонтальная раскладка на md+, вертикальная на мобильных
          'group relative flex flex-col md:flex-row',
          'overflow-hidden rounded-[var(--radius-lg)]',
          'border border-[var(--border)] bg-[var(--surface)]',
          // Одинаковая минимальная высота — все карточки в группе выровнены
          cardMinHeightClass,
          // Hover только на самой карточке: lift + бордер + тень
          // НЕТ: scale изображения, оверлея, затемнения
          'transition-all duration-300 ease-out',
          'hover:-translate-y-1',
          'hover:border-[var(--primary-400)]',
          'hover:shadow-[0_12px_40px_var(--shadow-color)]',
          // Для featured — базовая тень по умолчанию
          variant === 'featured' ? 'shadow-[0_2px_12px_var(--shadow-color)]' : '',
          onClick ? 'cursor-pointer' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={handleCardClick}
        // Доступность: кликабельная карточка фокусируема с клавиатуры
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') handleCardClick();
              }
            : undefined
        }
      >
        {/* Акцентная линия для featured — появляется только при hover */}
        {variant === 'featured' && (
          <div
            className={[
              'absolute inset-x-0 top-0 h-[2px]',
              'bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]',
              'opacity-0 transition-opacity duration-300 group-hover:opacity-100',
            ].join(' ')}
          />
        )}

        {renderImage()}
        {renderText()}

        {/* Edge-case: нет ни изображения ни текста */}
        {!showImage && !showText && <ImagePlaceholder />}
      </article>
    );
  },
);

ContentBlock.displayName = 'ContentBlock';