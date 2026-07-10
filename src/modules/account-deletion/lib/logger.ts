type Context = Record<string, unknown>;

/** Do not put names, emails, IDs, passwords, IPs, or raw errors in this logger. */
export const accountDeletionLogger = {
	info(message: string, context?: Context) {
		console.info("[AccountDeletion]", { message, ...context });
	},
	warn(message: string, context?: Context) {
		console.warn("[AccountDeletion]", { message, ...context });
	},
	error(message: string, context?: Context) {
		console.error("[AccountDeletion]", { message, ...context });
	},
};
