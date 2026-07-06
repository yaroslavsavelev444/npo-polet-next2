import { Heart } from "lucide-react";
import Link from "next/link";
import { Button } from "@/UI";

export function WishlistEmptyState() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--surface-secondary)]">
        <Heart className="h-9 w-9 text-[var(--text-muted)]" />
      </div>
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">
        В избранном пока пусто
      </h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Добавляйте товары в избранное, нажимая на сердечко на карточке товара
      </p>
      <Link href="/category" className="mt-6">
        <Button variant="primary">Перейти в каталог</Button>
      </Link>
    </div>
  );
}
