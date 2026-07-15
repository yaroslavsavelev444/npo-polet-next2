import {
	Building2,
	CreditCard,
	Mail,
	MessageSquareText,
	Phone,
	User,
	UserRound,
} from "lucide-react";
import type { ComponentType } from "react";
import type { Order } from "@/payload-types";
import { PAYMENT_METHOD_LABELS } from "../lib/labels";
import { ORDER_CARD_CLASS } from "./orderCard.styles";

interface OrderInfoPanelProps {
	recipient: {
		fullName: string;
		phone: string;
		email: string;
		contactPerson?: string | null;
	};
	payment: { method: Order["payment"]["method"] };
	company?: {
		name: string;
		taxNumber?: string | null;
		contactPerson?: string | null;
	} | null;
	notes?: string | null;
}

type IconType = ComponentType<{ size?: number; className?: string }>;

function Field({
	icon: Icon,
	label,
	value,
	href,
}: {
	icon: IconType;
	label: string;
	value: string;
	href?: string;
}) {
	return (
		<div className="flex items-start gap-3">
			<span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]">
				<Icon size={15} aria-hidden />
			</span>
			<div className="min-w-0 flex-1">
				<dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
				{href ? (
					<a
						href={href}
						className="block break-words text-sm font-medium text-[var(--text-primary)] transition-colors hover:text-[var(--accent-light)]"
					>
						{value}
					</a>
				) : (
					<dd className="break-words text-sm font-medium text-[var(--text-primary)]">
						{value}
					</dd>
				)}
			</div>
		</div>
	);
}

function Group({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3.5">
			<h3 className="text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
				{title}
			</h3>
			<dl className="flex flex-col gap-3.5">{children}</dl>
		</div>
	);
}

/**
 * Данные, введённые пользователем при оформлении: получатель, способ оплаты,
 * реквизиты организации и комментарий. Блоки доставки и промокодов намеренно
 * отсутствуют — этих сущностей в заказе нет. Пустые поля не отображаются.
 */
export function OrderInfoPanel({
	recipient,
	payment,
	company,
	notes,
}: OrderInfoPanelProps) {
	return (
		<section className={`flex flex-col gap-6 p-4 sm:p-5 ${ORDER_CARD_CLASS}`}>
			<Group title="Получатель">
				<Field icon={User} label="ФИО" value={recipient.fullName} />
				<Field
					icon={Phone}
					label="Телефон"
					value={recipient.phone}
					href={`tel:${recipient.phone.replace(/[^\d+]/g, "")}`}
				/>
				<Field
					icon={Mail}
					label="Email"
					value={recipient.email}
					href={`mailto:${recipient.email}`}
				/>
				{recipient.contactPerson && (
					<Field
						icon={UserRound}
						label="Контактное лицо"
						value={recipient.contactPerson}
					/>
				)}
			</Group>

			<div className="h-px bg-[var(--border)]" />

			<Group title="Оплата">
				<Field
					icon={CreditCard}
					label="Способ оплаты"
					value={PAYMENT_METHOD_LABELS[payment.method]}
				/>
			</Group>

			{company && (
				<>
					<div className="h-px bg-[var(--border)]" />
					<Group title="Организация">
						<Field icon={Building2} label="Название" value={company.name} />
						{company.taxNumber && (
							<Field icon={Building2} label="ИНН" value={company.taxNumber} />
						)}
						{company.contactPerson && (
							<Field
								icon={UserRound}
								label="Контактное лицо"
								value={company.contactPerson}
							/>
						)}
					</Group>
				</>
			)}

			{notes && (
				<>
					<div className="h-px bg-[var(--border)]" />
					<Group title="Комментарий">
						<Field icon={MessageSquareText} label="К заказу" value={notes} />
					</Group>
				</>
			)}
		</section>
	);
}
