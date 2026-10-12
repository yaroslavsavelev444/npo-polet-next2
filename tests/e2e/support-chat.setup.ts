import { execFileSync } from "node:child_process";
import path from "node:path";

const DIRNAME = __dirname;
const ROOT = path.resolve(DIRNAME, "../..");

/** Учётки и storageState обеих сторон, чистая переписка покупателя. */
export default function globalSetup(): void {
	execFileSync(
		process.execPath,
		[
			"--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
			"--experimental-strip-types",
			"--import",
			"./tests/support/next-subpath-resolver.mjs",
			path.join(ROOT, "scripts/seed-support-e2e.ts"),
		],
		{ cwd: ROOT, stdio: "inherit" },
	);
}
