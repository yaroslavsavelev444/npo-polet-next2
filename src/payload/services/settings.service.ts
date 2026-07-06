// services/settings.service.ts
import { unstable_cache } from "next/cache";
import type { Setting } from "../../../payload-types";
import { env } from "../../env";
import { getPayloadInstance } from "./getPayload";

async function fetchSettings(): Promise<Setting | null> {
  const payload = await getPayloadInstance();
  const result = await payload.findGlobal({
    slug: "settings",
    depth: 1,
  });
  return result as unknown as Setting | null;
}

export const getCachedSettings = () => {
  const fetchFn = () => fetchSettings();
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, ["settings"], {
    tags: ["settings"],
    revalidate: false,
  })();
};
