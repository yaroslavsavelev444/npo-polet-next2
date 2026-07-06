import { getPayloadInstance } from "@/payload/services/getPayload";
import type { EmailAddress } from "../types";

/**
 * Email всех пользователей с ролью admin/superadmin. Инкапсулирует запрос
 * к Payload — сценарии уведомлений не должны знать о схеме `users`.
 */
export async function getAdminEmailAddresses(): Promise<EmailAddress[]> {
  const payload = await getPayloadInstance();

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
