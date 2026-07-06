// app/(frontend)/reviews/page.tsx
import { noIndexMetadata, PagePlaceholder } from "@/modules/pagePlaceholder";

export const metadata = noIndexMetadata;

export default function ReviewsPage() {
  return (
    <PagePlaceholder
      variant="development"
      title="Мои отзывы"
      description="Здесь будет история ваших отзывов о товарах."
      action={{ label: "Вернуться в профиль", href: "/profile" }}
    />
  );
}
