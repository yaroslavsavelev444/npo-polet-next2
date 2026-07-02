'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Flex } from '@once-ui-system/core';
import type { Category, User } from '@/payload-types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  categories: Category[];
}

export default function MobileMenu({ isOpen, onClose, user, categories }: Props) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 top-[73px] bg-[#0a0c10]/95 backdrop-blur-2xl z-40 overflow-y-auto lg:hidden">
      <div className="p-6 flex flex-col gap-10">
        {/* Каталог */}
        <div>
          <h3 className="text-xs uppercase tracking-widest text-neutral-500 mb-3">Каталог</h3>
          <Flex vertical="center" gap={3}>
            {categories.map((cat) => (
              <Link key={cat.id} href={`/category/${cat.slug}`} onClick={onClose} className="block py-2 text-lg">
                {cat.name}
              </Link>
            ))}
          </Flex>
        </div>

        {/* Ресурсы и О нас */}
        <div className="grid grid-cols-2 gap-8">
          <div>
            <h3 className="text-xs uppercase tracking-widest text-neutral-500 mb-3">Ресурсы</h3>
            <Flex vertical="center" gap={3}>
              <Link href="/faq" onClick={onClose}>FAQ</Link>
              <Link href="/knowledge" onClick={onClose}>База знаний</Link>
            </Flex>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-widest text-neutral-500 mb-3">О нас</h3>
            <Flex vertical="center" gap={3}>
              <Link href="/agreements" onClick={onClose}>Соглашения</Link>
              <Link href="/contacts" onClick={onClose}>Контакты</Link>
            </Flex>
          </div>
        </div>

        {/* Аккаунт */}
        <div>
          <h3 className="text-xs uppercase tracking-widest text-neutral-500 mb-3">Аккаунт</h3>
          {user ? (
            <Flex vertical="center" gap="4">
              <Link href="/profile" onClick={onClose}>Профиль</Link>
              <Link href="/orders" onClick={onClose}>Мои заказы</Link>
              <Link href="/reviews" onClick={onClose}>Мои отзывы</Link>
              <Link href="/wishlist" onClick={onClose}>Избранное</Link>
              <button onClick={() => { /* logout action */ onClose(); }} className="text-left">
                Выйти
              </button>
            </Flex>
          ) : (
            <Link href="/auth/login" onClick={onClose}>Войти</Link>
          )}
        </div>
      </div>
    </div>
  );
}