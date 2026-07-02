// src/modules/cart/components/CartIcon.tsx
'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { ShoppingCart } from 'lucide-react'
import { useCartStore } from '@/shared/store/cart.store'

interface CartIconProps {
  initialCount: number
}

export function CartIcon({ initialCount }: CartIconProps) {
  const itemCount = useCartStore((s) => s.itemCount)
  const hydrate = useCartStore((s) => s.hydrate)

  useEffect(() => {
    hydrate(initialCount)
  }, [initialCount, hydrate])

  return (
    <Link
      href="/cart"
      aria-label="Корзина"
      className="relative flex h-9 w-9 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
    >
      <ShoppingCart size={18} />
      {itemCount > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-semibold leading-none text-white">
  {itemCount > 99 ? '99+' : itemCount}
</span>
      )}
    </Link>
  )
}