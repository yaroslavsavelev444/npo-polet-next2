export const dynamic = "force-dynamic";
export const revalidate = 0;

import { ConsentListItem } from "@/modules/auth/types";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { RegisterPageClient } from "./RegisterPageClient";

/**
 * Server Component: загружает список согласий через Payload Local API.
 * Нет клиентского fetch — данные готовы при рендере.
 */
export default async function RegisterPage() {
  const payload = await getPayloadInstance();

  const { docs: consents } = await payload.find({
    collection: "consents",
    where: {
      and: [
        { isActive: { equals: true } },
        { needsAcceptance: { equals: true } },
      ],
    },
    sort: "-isRequired", // Обязательные сначала
    limit: 20,
    overrideAccess: true,
  });

  // Маппим в простой объект для клиентского компонента
  const consentList: ConsentListItem[] = consents.map((c) => ({
    id: Number(c.id),
    slug: c.slug as string,
    title: c.title as string,
    version: (c.version ?? "1.0.0") as string,
    isRequired: (c.isRequired ?? false) as boolean,
    documentUrl: (c.documentUrl ?? null) as string | null,
  }));

  return <RegisterPageClient consents={consentList} />;
}
