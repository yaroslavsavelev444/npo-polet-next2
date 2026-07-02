// src/modules/cart/components/CartEmptyState.tsx
import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { Button } from '@/UI'

export function CartEmptyState() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--surface-secondary)]">
        <ShoppingCart className="h-9 w-9 text-[var(--text-muted)]" />
      </div>
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Ваша корзина пуста</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Добавьте товары, чтобы увидеть их здесь</p>
      <Link href="/categories" className="mt-6">
        <Button variant="primary">Перейти в каталог</Button>
      </Link>
    </div>
  )
}