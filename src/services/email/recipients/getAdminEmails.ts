// src/services/email/recipients/getAdminEmails.ts
import type { BasePayload } from "payload";
import type { EmailAddress } from "../types";

export async function getAdminEmailAddresses(
  payload: BasePayload, // ← принимаем инстанс, не создаём его сами
): Promise<EmailAddress[]> {
  const result = await payload.find({
    collection: "users",
    where: { role: { in: ["admin", "superadmin"] } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  });

  return result.docs
    .filter((user) => Boolean(user.email))
    .map((user) => ({ email: user.email, name: user.name }));
}
