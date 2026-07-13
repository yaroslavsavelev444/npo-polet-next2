// scripts/db-migrate/core/logger.ts

export interface Logger {
	info(msg: string, meta?: Record<string, unknown>): void;
	warn(msg: string, meta?: Record<string, unknown>): void;
	error(msg: string, meta?: Record<string, unknown>): void;
	debug(msg: string, meta?: Record<string, unknown>): void;
	child(prefix: string): Logger;
}

function format(
	level: string,
	prefix: string,
	msg: string,
	meta?: Record<string, unknown>,
): string {
	const time = new Date().toISOString();
	const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
	return `[${time}] ${level} ${prefix ? `[${prefix}] ` : ""}${msg}${metaStr}`;
}

export function createLogger(verbose: boolean, prefix = ""): Logger {
	return {
		info: (msg, meta) => console.log(format("INFO ", prefix, msg, meta)),
		warn: (msg, meta) => console.warn(format("WARN ", prefix, msg, meta)),
		error: (msg, meta) => console.error(format("ERROR", prefix, msg, meta)),
		debug: (msg, meta) => {
			if (verbose) console.log(format("DEBUG", prefix, msg, meta));
		},
		child: (childPrefix: string) =>
			createLogger(verbose, prefix ? `${prefix}:${childPrefix}` : childPrefix),
	};
}
