import type { BasePayload } from "payload";
import type { EmailAddress } from "../types.ts";

export async function getAdminEmailAddresses(
  payload: BasePayload,
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
