import { headers } from "next/headers";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { isUser } from "./typeGuards";

export async function getCurrentUser() {
  const payload = await getPayloadInstance();

  try {
    const { user } = await payload.auth({
      headers: await headers(),
    });

    return user && isUser(user) ? user : null;
  } catch {
    return null;
  }
}
