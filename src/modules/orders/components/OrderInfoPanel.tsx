import {
	Building2,
	CreditCard,
	Mail,
	MessageSquareText,
	Phone,
	User,
	UserRound,
} from "lucide-react";
import type { Order } from "@/payload-types";
import { PAYMENT_METHOD_LABELS } from "../lib/labels";
import { OrderField, OrderFieldGroup } from "./OrderField";
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
		name?: string | null;
		taxNumber?: string | null;
		contactPerson?: string | null;
		legalAddress?: string | null;
	} | null;
	notes?: string | null;
}

function Divider() {
	return <div className="h-px bg-[var(--border)]" />;
}

/**
 * Данные, введённые пользователем при оформлении: получатель, способ оплаты,
 * реквизиты организации и комментарий. Пустые поля не отображаются.
 * Переиспользуется на странице успеха и в модалке просмотра заказа.
 */
export function OrderInfoPanel({
	recipient,
	payment,
	company,
	notes,
}: OrderInfoPanelProps) {
	const hasCompany = Boolean(company?.name);

	return (
		<section className={`flex flex-col gap-6 p-4 sm:p-5 ${ORDER_CARD_CLASS}`}>
			<OrderFieldGroup title="Получатель">
				<OrderField icon={User} label="ФИО" value={recipient.fullName} />
				<OrderField
					icon={Phone}
					label="Телефон"
					value={recipient.phone}
					href={`tel:${recipient.phone.replace(/[^\d+]/g, "")}`}
				/>
				<OrderField
					icon={Mail}
					label="Email"
					value={recipient.email}
					href={`mailto:${recipient.email}`}
				/>
				{recipient.contactPerson && (
					<OrderField
						icon={UserRound}
						label="Контактное лицо"
						value={recipient.contactPerson}
					/>
				)}
			</OrderFieldGroup>

			<Divider />

			<OrderFieldGroup title="Оплата">
				<OrderField
					icon={CreditCard}
					label="Способ оплаты"
					value={PAYMENT_METHOD_LABELS[payment.method]}
				/>
			</OrderFieldGroup>

			{hasCompany && company && (
				<>
					<Divider />
					<OrderFieldGroup title="Организация">
						{company.name && (
							<OrderField
								icon={Building2}
								label="Название"
								value={company.name}
							/>
						)}
						{company.taxNumber && (
							<OrderField
								icon={Building2}
								label="ИНН"
								value={company.taxNumber}
							/>
						)}
						{company.legalAddress && (
							<OrderField
								icon={Building2}
								label="Юридический адрес"
								value={company.legalAddress}
							/>
						)}
						{company.contactPerson && (
							<OrderField
								icon={UserRound}
								label="Контактное лицо"
								value={company.contactPerson}
							/>
						)}
					</OrderFieldGroup>
				</>
			)}

			{notes && (
				<>
					<Divider />
					<OrderFieldGroup title="Комментарий">
						<OrderField
							icon={MessageSquareText}
							label="К заказу"
							value={notes}
						/>
					</OrderFieldGroup>
				</>
			)}
		</section>
	);
}
