'use client';

import DropdownMenu from './DropdownMenu';
import type { Category } from '@/payload-types';

interface Props {
  categories: Category[];
}

export default function NavMenus({ categories }: Props) {
  return (
    <div className="flex items-center gap-8">
      <DropdownMenu
        trigger="Каталог"
        items={categories.map((cat) => ({
          label: cat.name,
          href: `/category/${cat.slug}`,
        }))}
      />
      <DropdownMenu
        trigger="Ресурсы"
        items={[
          { label: 'FAQ', href: '/faq' },
          { label: 'База знаний', href: '/knowledge' },
        ]}
      />
      <DropdownMenu
        trigger="О нас"
        items={[
          { label: 'Соглашения', href: '/agreements' },
          { label: 'Контакты', href: '/contacts' },
        ]}
      />
    </div>
  );
}