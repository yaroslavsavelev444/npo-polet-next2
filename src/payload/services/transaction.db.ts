import type { Payload } from "payload";

export type TransactionDatabase = Pick<Payload["db"]["drizzle"], "execute">;

export function getTransactionDatabase(
	payload: Payload,
	id: string | number,
): TransactionDatabase {
	const session = payload.db.sessions?.[id];
	if (!session) throw new Error("Payload transaction is no longer active");
	return session.db as TransactionDatabase;
}
