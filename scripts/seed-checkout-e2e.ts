/**
 * Подготовка окружения для E2E-тестов оформления заказа.
 *
 * Скрипт идемпотентен: повторный запуск не плодит сущности, а приводит уже
 * существующие к нужному состоянию. Это важно, потому что Playwright
 * запускает его перед каждым прогоном.
 *
 * Что создаётся:
 *  • категория и три товара (обычный, со скидкой, с минимальным заказом);
 *  • пункт самовывоза и транспортная компания;
 *  • тестовый покупатель + активная сессия (cookies сохраняются в
 *    tests/e2e/.auth/state.json как storageState для Playwright);
 *  • корзина с позициями;
 *  • ДВА исторических заказа в старых форматах адреса — они существуют
 *    только ради проверки обратной совместимости и создаются напрямую
 *    через Local API с overrideAccess.
 *
 * Вход через UI здесь не используется намеренно: он требует OTP из письма,
 * то есть внешнего канала. Сессия выпускается тем же способом, что и в
 * verifyOtpAction (payload.login → payload-token + запись Sessions), поэтому
 * тестируется ровно тот же авторизованный контекст, что и у живого
 * пользователя.
 *
 * Запуск: pnpm seed:e2e
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import { AUTH_FLOW_CONTEXT } from "../src/payload/hooks/users/requireServerAuthFlow.ts";

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIRNAME, "..");

export const E2E_USER = {
	email: "e2e.checkout@example.test",
	password: "E2e-Checkout-Pass-2026!",
	name: "Тестовый Покупатель",
};

export const E2E_COMPANY = {
	name: "E2E Организация",
	taxNumber: "7707083893",
};

/** Заказы стенда со старыми форматами адреса — их удалять нельзя. */
export const LEGACY_ORDER_NUMBERS = ["ORD-2019-000001", "ORD-2020-000002"];

export const E2E_ADMIN = {
	email: "e2e.admin@example.test",
	password: "E2e-Admin-Pass-2026!",
};

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

async function upsert<T extends Record<string, unknown>>(
	payload: Awaited<ReturnType<typeof getPayload>>,
	collection: string,
	where: Record<string, unknown>,
	data: T,
): Promise<{ id: number }> {
	const { docs } = await payload.find({
		collection: collection as never,
		where: where as never,
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});

	if (docs[0]) {
		const updated = await payload.update({
			collection: collection as never,
			id: (docs[0] as { id: number }).id,
			data: data as never,
			overrideAccess: true,
			context: { isMigration: true },
		});
		return updated as unknown as { id: number };
	}

	const created = await payload.create({
		collection: collection as never,
		data: data as never,
		overrideAccess: true,
		context: { isMigration: true },
	});
	return created as unknown as { id: number };
}

/**
 * `sid` из полезной нагрузки JWT. Копия extractPayloadSessionId, чтобы скрипт
 * не тянул модуль auth (тот использует импорты без расширений и не
 * разрешается через `node --experimental-strip-types`).
 */
function extractSid(token: string): string | null {
	try {
		const payloadPart = token.split(".")[1];
		if (!payloadPart) return null;
		const decoded = JSON.parse(
			Buffer.from(payloadPart, "base64url").toString("utf8"),
		) as { sid?: unknown };
		return typeof decoded.sid === "string" ? decoded.sid : null;
	} catch {
		return null;
	}
}

async function main() {
	const payload = await getPayload({ config });

	// ── Справочники ─────────────────────────────────────────────────────────
	const category = await upsert(
		payload,
		"categories",
		{ slug: { equals: "e2e-category" } },
		{
			name: "E2E Категория",
			slug: "e2e-category",
			isActive: true,
		},
	);

	const products: number[] = [];
	const productSpecs = [
		{ title: "E2E Товар обычный", price: 1000, min: 1 },
		{ title: "E2E Товар со скидкой", price: 2000, min: 1 },
	];

	for (const spec of productSpecs) {
		const product = await upsert(
			payload,
			"products",
			{ title: { equals: spec.title } },
			{
				title: spec.title,
				description: `Товар для автотестов: ${spec.title}`,
				category: category.id,
				pricing: { priceForIndividual: spec.price },
				inventory: {
					status: "available",
					isVisible: true,
					minOrderQuantity: spec.min,
				},
			},
		);
		products.push(product.id);
	}

	const pickupPoint = await upsert(
		payload,
		"pickup-points",
		{ name: { equals: "E2E Пункт самовывоза" } },
		{
			name: "E2E Пункт самовывоза",
			address: "г. Москва, ул. Складская, д. 1",
			city: "Москва",
			workingHours: "Пн-Пт 9:00–18:00",
			isActive: true,
		},
	);

	const transportCompany = await upsert(
		payload,
		"transport-companies",
		{ name: { equals: "E2E Перевозчик" } },
		{ name: "E2E Перевозчик", phone: "+74950000000", isActive: true },
	);

	// ── Пользователь ────────────────────────────────────────────────────────
	const { docs: existingUsers } = await payload.find({
		collection: "users",
		where: { email: { equals: E2E_USER.email } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});

	let userId: number;
	if (existingUsers[0]) {
		userId = (existingUsers[0] as { id: number }).id;
		await payload.update({
			collection: "users",
			id: userId,
			data: {
				password: E2E_USER.password,
				status: "active",
				emailVerified: true,
				loginAttempts: 0,
				lockUntil: null,
			},
			overrideAccess: true,
			context: { skipServerAuthFlowCheck: true },
		});
	} else {
		const created = await payload.create({
			collection: "users",
			data: {
				email: E2E_USER.email,
				password: E2E_USER.password,
				name: E2E_USER.name,
				role: "user",
				status: "active",
				emailVerified: true,
			},
			overrideAccess: true,
			context: { skipServerAuthFlowCheck: true },
		});
		userId = (created as { id: number }).id;
	}

	// ── Корзина ─────────────────────────────────────────────────────────────
	await upsert(
		payload,
		"carts",
		{ user: { equals: userId } },
		{
			user: userId,
			items: products.map((product) => ({
				product,
				quantity: 2,
				addedAt: new Date().toISOString(),
			})),
		},
	);

	// ── Организация покупателя ──────────────────────────────────────────────
	// Нужна для сценария «сохранённую организацию удалили, пока оформляли
	// заказ»: это единственная проверка, которую клиент воспроизвести не может
	// (принадлежность организации проверяется только на сервере).
	await upsert(
		payload,
		"companies",
		{ companyName: { equals: E2E_COMPANY.name } },
		{
			user: userId,
			companyName: E2E_COMPANY.name,
			legalAddress: "г Москва, ул Ленина, д 1",
			taxNumber: E2E_COMPANY.taxNumber,
			contactPerson: "Иванов И.И.",
		},
	);

	// ── Сохранённые предпочтения сбрасываем ─────────────────────────────────
	// Иначе форма приходит предзаполненной с прошлого прогона, и тесты
	// «пустая форма → ошибки» перестают проверять то, ради чего написаны.
	const { docs: prefs } = await payload.find({
		collection: "checkout-preferences",
		where: { user: { equals: userId } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	if (prefs[0]) {
		await payload.delete({
			collection: "checkout-preferences",
			id: (prefs[0] as { id: number }).id,
			overrideAccess: true,
		});
	}

	// ── Исторические заказы для проверки обратной совместимости ─────────────
	const legacyOrderBase = {
		user: userId,
		status: "delivered" as const,
		recipient: {
			fullName: "Петров Пётр Петрович",
			phone: "+79990001122",
			email: E2E_USER.email,
		},
		items: [
			{
				product: products[0],
				name: "E2E Товар обычный",
				quantity: 1,
				unitPrice: 1000,
				discount: 0,
				totalPrice: 1000,
			},
		],
		pricing: { subtotal: 1000, total: 1000, currency: "RUB" },
		payment: { method: "invoice" as const, status: "paid" as const },
	};

	// Поколение 1: весь адрес одной строкой в street, полей house/apartment нет.
	await upsert(
		payload,
		"orders",
		{ orderNumber: { equals: "ORD-2019-000001" } },
		{
			...legacyOrderBase,
			orderNumber: "ORD-2019-000001",
			delivery: {
				method: "door_to_door",
				transportCompany: transportCompany.id,
				address: { street: "г. Тула, ул. Старая, д. 7, кв. 3" },
			},
		},
	);

	// Поколение 2: разбитые поля, но без fullAddress и идентификаторов ФИАС.
	await upsert(
		payload,
		"orders",
		{ orderNumber: { equals: "ORD-2020-000002" } },
		{
			...legacyOrderBase,
			orderNumber: "ORD-2020-000002",
			delivery: {
				method: "door_to_door",
				transportCompany: transportCompany.id,
				address: {
					city: "Калуга",
					street: "ул. Новая",
					house: "12",
					apartment: "45",
					postalCode: "248000",
					country: "Россия",
				},
			},
		},
	);

	// ── Сессия для Playwright ───────────────────────────────────────────────
	// AUTH_FLOW_CONTEXT обязателен: beforeLogin-хук requireServerAuthFlow
	// отклоняет любой payload.login() без него — так закрыт прямой
	// POST /api/users/login в обход OTP. Здесь он правомерен: токен не
	// покидает машину разработчика и кладётся в локальный storageState.
	const login = await payload.login({
		collection: "users",
		data: { email: E2E_USER.email, password: E2E_USER.password },
		context: AUTH_FLOW_CONTEXT,
	});

	// Запись Sessions с теми же полями, что создаёт verifyOtpAction. Особенно
	// важен payloadSessionId (claim `sid` выданного JWT): по нему proxy.ts
	// сверяет, что сессия не отозвана, и без него защищённые страницы
	// (/orders) отдали бы редирект на вход прямо посреди теста.
	const now = new Date();
	const session = await payload.create({
		collection: "sessions",
		data: {
			user: userId,
			payloadSessionId: extractSid(String(login.token)),
			ip: "127.0.0.1",
			userAgent: "playwright-e2e",
			deviceLabel: "Playwright",
			createdAt: now.toISOString(),
			lastActiveAt: now.toISOString(),
			expiresAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString(),
			revoked: false,
		},
		overrideAccess: true,
	});

	const { hostname } = new URL(BASE_URL);
	const storageState = {
		cookies: [
			{
				name: "payload-token",
				value: String(login.token),
				domain: hostname,
				path: "/",
				expires: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
				httpOnly: true,
				secure: false,
				sameSite: "Lax" as const,
			},
			{
				name: "session-id",
				value: String((session as { id: number }).id),
				domain: hostname,
				path: "/",
				expires: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
				httpOnly: true,
				secure: false,
				sameSite: "Lax" as const,
			},
		],
		origins: [],
	};

	// ── Администратор для проверки админки ──────────────────────────────────
	// Отдельный аккаунт, а не боевой: пароль боевого неизвестен, и менять его
	// ради тестов нельзя. Коллекция admins не проходит через OTP-флоу
	// покупателей, поэтому payload.login здесь достаточно.
	const { docs: existingAdmins } = await payload.find({
		collection: "admins",
		where: { email: { equals: E2E_ADMIN.email } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});

	if (existingAdmins[0]) {
		await payload.update({
			collection: "admins",
			id: (existingAdmins[0] as { id: number }).id,
			data: { password: E2E_ADMIN.password, role: "admin" },
			overrideAccess: true,
		});
	} else {
		await payload.create({
			collection: "admins",
			data: {
				email: E2E_ADMIN.email,
				password: E2E_ADMIN.password,
				name: "E2E Администратор",
				role: "admin",
			},
			overrideAccess: true,
		});
	}

	const adminLogin = await payload.login({
		collection: "admins",
		data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
	});

	const authDir = path.join(ROOT, "tests/e2e/.auth");
	mkdirSync(authDir, { recursive: true });
	writeFileSync(
		path.join(authDir, "state.json"),
		JSON.stringify(storageState, null, 2),
	);
	writeFileSync(
		path.join(authDir, "admin-state.json"),
		JSON.stringify(
			{
				cookies: [
					{
						name: "payload-token",
						value: String(adminLogin.token),
						domain: hostname,
						path: "/",
						expires: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
						httpOnly: true,
						secure: false,
						sameSite: "Lax" as const,
					},
				],
				origins: [],
			},
			null,
			2,
		),
	);
	writeFileSync(
		path.join(authDir, "fixtures.json"),
		JSON.stringify(
			{
				userId,
				pickupPointId: pickupPoint.id,
				pickupPointName: "E2E Пункт самовывоза",
				transportCompanyId: transportCompany.id,
				transportCompanyName: "E2E Перевозчик",
				productIds: products,
				legacyOrderNumbers: LEGACY_ORDER_NUMBERS,
				adminEmail: E2E_ADMIN.email,
			},
			null,
			2,
		),
	);

	console.log("E2E seed готов:", {
		userId,
		products,
		pickupPoint: pickupPoint.id,
		transportCompany: transportCompany.id,
	});
	process.exit(0);
}

main().catch((error) => {
	console.error("E2E seed упал:", error);
	process.exit(1);
});
