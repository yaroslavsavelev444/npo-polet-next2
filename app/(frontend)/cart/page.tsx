// app/(frontend)/cart/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/modules/auth/lib/getCurrentUser'
import { getCartByUserId } from '@/payload/services/carts.service'
import { buildCartView } from '@/modules/cart/lib/build-cart-view'
import { CartPageClient } from '@/modules/cart/components/CartPageClient'

export const metadata = {
  title: 'Корзина',
}

export default async function CartPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/auth/login?from=/cart')
  }

  const cart = await getCartByUserId(String(user.id))
  const cartView = await buildCartView(cart)

  return <CartPageClient initialCart={cartView} />
}