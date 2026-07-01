'use client';

import { RightOutlined } from '@ant-design/icons';
import { Breadcrumb } from 'antd';
import type { ItemType } from 'antd/es/breadcrumb/Breadcrumb';
import Link from 'next/link';
import React from 'react';

interface BreadcrumbsProps {
  /** Массив элементов хлебных крошек */
  items: ItemType[];
  /** Дополнительный CSS-класс для контейнера */
  className?: string;
  /** Вариант оформления */
  variant?: 'default' | 'light' | 'dark' | 'transparent';
  /** Выравнивание */
  align?: 'start' | 'center' | 'end';
}

/**
 * Улучшенный компонент хлебных крошек
 * - Горизонтальное расположение в одну строку
 * - Фон блока с закруглёнными краями
 * - Стрелочки-указатели между элементами
 * - Адаптивная стилизация
 */
export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  items,
  className = '',
  variant = 'default',
  align = 'start',
}) => {
  // Стили контейнера в зависимости от варианта
  const getContainerStyles = () => {
    const base = `
      inline-flex items-center gap-2 px-5 py-3 
      rounded-2xl border border-[var(--border)]
      min-h-[48px] w-fit
      transition-all duration-200
    `;

    switch (variant) {
      case 'light':
        return `${base} bg-[var(--surface)]`;
      case 'dark':
        return `${base} bg-[var(--text-primary)] text-white border-transparent`;
      case 'transparent':
        return `${base} bg-transparent border-transparent px-0 py-2`;
      default:
        return `${base} bg-[var(--background)] shadow-sm`;
    }
  };

  const containerClass = `
    ${getContainerStyles()}
    ${align === 'center' ? 'justify-center' : align === 'end' ? 'justify-end' : 'justify-start'}
    ${className}
  `;

  return (
    <div className={containerClass}>
      <Breadcrumb
        separator={
          <RightOutlined 
            style={{ 
              fontSize: '14px', 
              opacity: 0.6,
              color: 'var(--text-secondary)'
            }} 
          />
        }
        items={items}
        itemRender={(route, params, routes, paths) => {
          const isLast = route === routes[routes.length - 1];

          const content = (
            <span
              className={`
                transition-colors duration-200
                ${isLast 
                  ? 'text-[var(--text-primary)] font-medium cursor-default' 
                  : 'hover:text-[var(--primary)] cursor-pointer'
                }
              `}
            >
              {route.title}
            </span>
          );

          if (isLast) {
            return content;
          }

          return (
            <Link
              href={route.href || '#'}
              className="no-underline"
            >
              {content}
            </Link>
          );
        }}
      />
    </div>
  );
};

// Вспомогательная функция для удобного создания items
export const createBreadcrumbItem = (
  title: React.ReactNode,
  href?: string,
  disabled?: boolean
): ItemType => ({
  title,
  href,
  disabled,
});

// Пример использования:
/*
<Breadcrumbs
  items={[
    createBreadcrumbItem('Главная', '/'),
    createBreadcrumbItem('Каталог', '/catalog'),
    createBreadcrumbItem('Ноутбуки', '/catalog/laptops'),
    createBreadcrumbItem('MacBook Pro', undefined, true),
  ]}
  variant="default"
/>
*/