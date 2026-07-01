'use client';

import { usePathname } from 'next/navigation';
import { Breadcrumbs } from './Breadcrumbs';
import type { ItemType } from 'antd/es/breadcrumb/Breadcrumb';

const routeMap: Record<string, string> = {
  '/': 'Главная',
  '/about': 'О нас',
  '/catalog': 'Каталог',
  '/contacts': 'Контакты',
  '/blog': 'Блог',
  '/dashboard': 'Личный кабинет',
};

export const AutoBreadcrumbs = () => {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  const items: ItemType[] = [];
  let currentPath = '';

  for (const segment of segments) {
    currentPath += `/${segment}`;
    const title = routeMap[currentPath] || segment;
    items.push({
      href: currentPath,
      title,
    });
  }

  // Добавляем корневую страницу, если ещё не добавлена
  if (items.length > 0 && items[0].href !== '/') {
    items.unshift({ href: '/', title: routeMap['/'] || 'Главная' });
  } else if (items.length === 0) {
    items.push({ title: routeMap['/'] || 'Главная' });
  }

  // Последний элемент делаем без ссылки
  if (items.length > 0) {
    delete items[items.length - 1].href;
  }

  return <Breadcrumbs items={items} />;
};