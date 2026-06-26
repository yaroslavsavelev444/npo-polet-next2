'use client';

import { Button } from '@once-ui-system/core';
import Link from 'next/link';
import DropdownMenu from './DropdownMenu';
import type { User } from '@/payload-types';

interface Props {
  user: User | null;
}

export default function UserMenu({ user }: Props) {
  if (!user) {
    return (
      <Link href="/auth/login">
        <Button variant="secondary" size="s" className="rounded-xl">
          Войти
        </Button>
      </Link>
    );
  }

  return (
    <DropdownMenu
      trigger={user.name || 'Профиль'}
      items={[
        { label: 'Профиль', href: '/profile' },
        { label: 'Мои заказы', href: '/orders' },
        { label: 'Мои отзывы', href: '/reviews' },
        { label: 'Выйти', href: '#' }, // будет обработано в DropdownMenu при необходимости
      ]}
    />
  );
}