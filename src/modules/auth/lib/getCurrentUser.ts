import { headers } from "next/headers";
import { getPayload } from "payload";
import config from "@/payloadconfig";
import { isUser } from "./typeGuards";

export async function getCurrentUser() {
  const payload = await getPayload({ config });

  try {
    const { user } = await payload.auth({
      headers: await headers(),
    });

    return user && isUser(user) ? user : null;
  } catch {
    return null;
  }
}
