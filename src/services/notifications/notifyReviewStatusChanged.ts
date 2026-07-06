// src/services/notifications/notifyReviewStatusChanged.ts
import { Product, ProductReview, User } from "../../../payload-types";
import { getProductHref } from "../../modules/productCard/lib/routing"; // было "@/modules/productCard"
import { emailService, reviewStatusChangedEmailTemplate } from "../email";
import { getEmailConfig } from "../email/config";
import { emailLogger } from "../email/logger";

export async function notifyReviewStatusChanged(
  review: ProductReview,
): Promise<void> {
  if (review.status !== "approved" && review.status !== "rejected") return;

  const user = review.user as User;
  const product = review.product as Product;
  if (typeof user !== "object" || typeof product !== "object") return;

  const { appUrl } = getEmailConfig();
  try {
    await emailService.send(
      reviewStatusChangedEmailTemplate,
      {
        userName: user.name,
        productTitle: product.title,
        status: review.status,
        rejectionReason: review.rejectionReason,
        productUrl: `${appUrl}${getProductHref({ id: String(product.id), category: null })}`,
      },
      { to: { email: user.email } },
    );
  } catch (error) {
    emailLogger.error("Не удалось уведомить о статусе отзыва", {
      reviewId: review.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
