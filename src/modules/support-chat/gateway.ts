// Первым: при локальном запуске (pnpm support:gateway) переменные берутся из
// .env; в проде их передаёт compose (env_file), и файла в контейнере нет —
// dotenv тогда ничего не делает и уже заданное не перезаписывает.
import "dotenv/config";
import { createServer } from "node:http";
import Redis from "ioredis";
import { env } from "@/env";
import { redisConfig } from "@/modules/auth/lib/redis-config";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { captureError } from "@/services/observability/capture";
import {
	closeObservability,
	flushCaptures,
	installWorkerProcessCapture,
} from "@/services/observability/process";
import { assertEncryptionConfigured } from "./server/crypto.ts";
import { createSupportGateway, HEALTH_PATH } from "./server/gateway/server.ts";

/**
 * Процесс Socket.IO-шлюза чата поддержки.
 *
 * Отдельный процесс, а не часть Next: standalone-сервер Next не держит
 * WebSocket, а рестарт веб-приложения при выкладке не должен рвать открытые
 * переписки. Запуск — голым Node с резолвером, как у воркеров (под tsx
 * getPayload падает на интеропе @next/env):
 *
 *   pnpm support:gateway
 *
 * В проде — сервис support-gateway в docker-compose.prod.yml; nginx
 * проксирует на него `/realtime/` витрины и админки.
 */

installWorkerProcessCapture("support-chat/gateway");

// Без мастер-ключа шлюз не может ни записать, ни прочитать ни одного
// сообщения — падаем сразу и понятно, а не на первом сообщении покупателя.
assertEncryptionConfigured();

const allowedOrigins = env.ALLOWED_ORIGINS.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const payload = await getPayloadInstance();

// Три соединения: присутствие (обычные команды) и пара для redis-adapter —
// клиент в режиме подписки другими командами пользоваться не может.
const redis = new Redis(redisConfig);
const pub = new Redis(redisConfig);
const sub = pub.duplicate();

const httpServer = createServer((request, response) => {
	if (request.url === HEALTH_PATH) {
		response.writeHead(200, { "content-type": "application/json" });
		response.end(
			JSON.stringify({
				ok: true,
				connections: gateway.io.engine.clientsCount,
				rssMb: Math.round(process.memoryUsage().rss / 1_048_576),
				heapMb: Math.round(process.memoryUsage().heapUsed / 1_048_576),
			}),
		);
		return;
	}
	response.writeHead(404).end();
});

const gateway = createSupportGateway({
	payload,
	redis,
	httpServer,
	allowedOrigins,
	adapter: { pub, sub },
	periodicTasks: true,
});

httpServer.listen(env.SUPPORT_GATEWAY_PORT, "0.0.0.0", () => {
	console.info(`[support-gateway] listening on :${env.SUPPORT_GATEWAY_PORT}`);
});

httpServer.on("error", (error) => {
	const errorId = captureError(error, {
		source: "process",
		severity: "fatal",
		module: "support-chat/gateway",
	});
	console.error("[support-gateway] http server error", { errorId, error });
	process.exit(1);
});

let stopping = false;

/**
 * Штатная остановка (выкладка, рестарт контейнера): закрыть сокеты — клиенты
 * переподключатся к новому процессу сами и догрузят пропущенное по номеру
 * сообщения, — затем соединения с Redis и журналом ошибок.
 */
async function shutdown(signal: string) {
	if (stopping) return;
	stopping = true;
	console.info(`[support-gateway] ${signal}, shutting down`);
	await gateway.close().catch(() => {});
	await Promise.allSettled([redis.quit(), pub.quit(), sub.quit()]);
	await flushCaptures();
	await closeObservability();
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
