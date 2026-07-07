import type { Admin, User } from "@/payload-types";

/**
 * Narrows the polymorphic Payload auth() result (admins vs. users collection)
 * down to a storefront `User`. Admin-only staff accounts never carry shopper
 * fields (2FA, order status, etc.), so every read of those fields must
 * narrow through this guard first instead of casting.
 */
export function isUser(
  account: Admin | User | null | undefined,
): account is User {
  return !!account && account.collection === "users";
}

export function isAdmin(
  account: Admin | User | null | undefined,
): account is Admin {
  return !!account && account.collection === "admins";
}
