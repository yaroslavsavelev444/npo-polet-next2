// src/payload/services/getPayload.ts
import { getPayload } from "payload";
import config from "../../../payload.config"; // было "@/payloadconfig"

let cachedPayload: Awaited<ReturnType<typeof getPayload>> | null = null;

export async function getPayloadInstance() {
  if (!cachedPayload) {
    cachedPayload = await getPayload({ config });
  }
  return cachedPayload;
}
