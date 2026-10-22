import { execFileSync } from "node:child_process";
import path from "node:path";

const DIRNAME = __dirname;
const ROOT = path.resolve(DIRNAME, "../..");

/** Галочка «Вход через Яндекс ID» — как была до прогона. */
export default function globalTeardown(): void {
	execFileSync(
		process.execPath,
		[
			"--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
			"--experimental-strip-types",
			"--import",
			"./tests/support/next-subpath-resolver.mjs",
			path.join(ROOT, "scripts/seed-yandex-e2e.ts"),
			"off",
		],
		{ cwd: ROOT, stdio: "inherit" },
	);
}
