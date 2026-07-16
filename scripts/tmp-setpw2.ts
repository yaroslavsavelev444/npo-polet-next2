import "dotenv/config";
import { getPayload } from "payload";
import config from "../payload.config.ts";

async function main() {
	const payload = await getPayload({ config });
	const { docs } = await payload.find({
		collection: "users",
		where: { email: { equals: "dates@example.com" } },
		limit: 1,
		overrideAccess: true,
	});
	await payload.update({
		collection: "users",
		id: docs[0].id,
		data: { password: "TestPass123!" },
		overrideAccess: true,
	});
	console.log("пароль задан для", docs[0].email, "id", docs[0].id);
	process.exit(0);
}
main();
