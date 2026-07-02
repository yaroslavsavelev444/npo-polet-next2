import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/modules/auth/lib/getCurrentUser'
import { getWishlistByUserId } from '@/payload/services/wishlists.service'
import { buildWishlistView } from '@/modules/wishlist/lib/build-wishlist-view'
import { WishlistPageClient } from '@/modules/wishlist/components/WishlistPageClient'

export const metadata = {
  title: 'Избранное',
}

export default async function WishlistPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/auth/login?from=/wishlist')
  }

  const wishlist = await getWishlistByUserId(String(user.id))
  const wishlistView = buildWishlistView(wishlist)

  return <WishlistPageClient initialWishlist={wishlistView} />
}