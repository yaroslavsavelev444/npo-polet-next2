// services/faq.service.ts
import { unstable_cache } from "next/cache";
import type { Faq } from "../../../payload-types";
import { env } from "../../env";
import { getPayloadInstance } from "./getPayload";

async function fetchFaqTopics(): Promise<Faq[]> {
	const payload = await getPayloadInstance();
	const result = await payload.find({
		collection: "faq",
		where: { isActive: { equals: true } },
		sort: "order",
		limit: 200,
		depth: 0,
	});
	return result.docs as Faq[];
}

export const getCachedFaqTopics = () => {
	if (env.NODE_ENV === "development") {
		return fetchFaqTopics();
	}
	return unstable_cache(fetchFaqTopics, ["faq-topics"], {
		tags: ["faq"],
		revalidate: false,
	})();
};
