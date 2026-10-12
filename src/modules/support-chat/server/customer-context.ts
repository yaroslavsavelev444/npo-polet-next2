import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import {
	drizzleOf,
	type Executor,
	iso,
	num,
	numOrNull,
	query,
	queryOne,
	str,
} from "./db.ts";

/**
 * Всё о покупателе, что нужно менеджеру рядом с перепиской: профиль,
 * организации, последние заказы, корзина, прошлые диалоги. Одним вызовом
 * при открытии диалога в консоли.
 *
 * Сырой SQL, а не Local API: пять независимых выборок по индексам вместо
 * пяти find с глубиной и правами; права проверены выше — это персонал.
 * Ссылки ведут в админку (относительные — консоль живёт на хосте админки).
 */

export interface CustomerContextDTO {
	customer: {
		id: number;
		name: string;
		email: string;
		status: string;
		/** Запрещено писать в чат. */
		chatBanned: boolean;
		registeredAt: string | null;
		adminUrl: string;
	};
	companies: {
		id: number;
		name: string;
		inn: string | null;
		kpp: string | null;
		adminUrl: string;
	}[];
	orders: {
		id: number;
		orderNumber: string;
		status: string;
		total: number | null;
		phone: string | null;
		createdAt: string | null;
		adminUrl: string;
	}[];
	cart: {
		productId: number;
		title: string;
		slug: string | null;
		quantity: number;
	}[];
	otherConversations: {
		id: number;
		status: string;
		createdAt: string | null;
		lastMessageAt: string | null;
		csatScore: number | null;
	}[];
}

async function loadContext(
	db: Executor,
	userId: number,
	currentConversationId: number,
): Promise<CustomerContextDTO | null> {
	const user = await queryOne(
		db,
		sql`SELECT id, name, email, status, support_chat_banned, created_at FROM users WHERE id = ${userId}`,
	);
	if (!user) return null;

	const [companies, orders, cart, conversations] = await Promise.all([
		query(
			db,
			sql`SELECT id, company_name, tax_number, kpp FROM companies
				WHERE user_id = ${userId} ORDER BY id`,
		),
		query(
			db,
			sql`SELECT id, order_number, status, pricing_total, contact_phone, created_at
				FROM orders WHERE user_id = ${userId}
				ORDER BY created_at DESC LIMIT 10`,
		),
		query(
			db,
			sql`SELECT ci.product_id, ci.quantity, p.slug, pl.title
				FROM carts c
				JOIN carts_items ci ON ci._parent_id = c.id
				LEFT JOIN products p ON p.id = ci.product_id
				LEFT JOIN products_locales pl ON pl._parent_id = p.id AND pl._locale = 'ru'
				WHERE c.user_id = ${userId}
				ORDER BY ci._order`,
		),
		query(
			db,
			sql`SELECT id, status, created_at, last_message_at, csat_score
				FROM support_conversations
				WHERE user_id = ${userId} AND id <> ${currentConversationId}
				ORDER BY created_at DESC LIMIT 10`,
		),
	]);

	return {
		customer: {
			id: num(user.id),
			name: str(user.name) ?? "",
			email: str(user.email) ?? "",
			status: str(user.status) ?? "active",
			chatBanned: user.support_chat_banned === true,
			registeredAt: iso(user.created_at),
			adminUrl: `/admin/collections/users/${num(user.id)}`,
		},
		companies: companies.map((row) => ({
			id: num(row.id),
			name: str(row.company_name) ?? "",
			inn: str(row.tax_number),
			kpp: str(row.kpp),
			adminUrl: `/admin/collections/companies/${num(row.id)}`,
		})),
		orders: orders.map((row) => ({
			id: num(row.id),
			orderNumber: str(row.order_number) ?? "",
			status: str(row.status) ?? "",
			total: numOrNull(row.pricing_total),
			phone: str(row.contact_phone),
			createdAt: iso(row.created_at),
			adminUrl: `/admin/collections/orders/${num(row.id)}`,
		})),
		cart: cart.map((row) => ({
			productId: num(row.product_id),
			title: str(row.title) ?? "Товар",
			slug: str(row.slug),
			quantity: num(row.quantity),
		})),
		otherConversations: conversations.map((row) => ({
			id: num(row.id),
			status: str(row.status) ?? "",
			createdAt: iso(row.created_at),
			lastMessageAt: iso(row.last_message_at),
			csatScore: numOrNull(row.csat_score),
		})),
	};
}

export async function getCustomerContext(
	payload: Payload,
	conversation: { id: number; userId: number | null },
): Promise<CustomerContextDTO | null> {
	if (conversation.userId === null) return null;
	return loadContext(drizzleOf(payload), conversation.userId, conversation.id);
}
