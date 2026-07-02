'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Heart } from 'lucide-react'
import { useWishlistStore } from '@/shared/store/wishlist.store'

interface WishlistIconProps {
  initialProductIds: string[]
}

export function WishlistIcon({ initialProductIds }: WishlistIconProps) {
  const count = useWishlistStore((s) => s.productIds.size)
  const hydrate = useWishlistStore((s) => s.hydrate)

  useEffect(() => {
    hydrate(initialProductIds)
  }, [initialProductIds, hydrate])

  return (
    <Link
      href="/wishlist"
      aria-label="Избранное"
      className="relative flex h-9 w-9 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
    >
      <Heart size={18} />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-semibold leading-none text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}