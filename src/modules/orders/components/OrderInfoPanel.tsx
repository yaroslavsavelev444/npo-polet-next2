import {
	Building2,
	CreditCard,
	Mail,
	MessageSquareText,
	Phone,
	PhoneCall,
	User,
	UserRound,
} from "lucide-react";
import type { Order } from "@/payload-types";
import { PAYMENT_METHOD_LABELS } from "../lib/labels";
import type { OrderContactPreference } from "../lib/order-contact";
import { OrderField } from "./OrderField";
import styles from "./Orders.module.css";

interface OrderInfoPanelProps {
	/**
	 * Контакты заказа. `phone` — номер, по которому менеджер связывается по
	 * заказу; у заказов, оформленных до разделения номеров, он совпадает с
	 * телефоном получателя (см. lib/order-contact).
	 */
	contact: {
		phone: string;
		owner: OrderContactPreference | null;
		customerPhone: string;
		recipientPhone: string;
	};
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

/** Телефон в виде, пригодном для tel:. */
function telHref(phone: string): string {
	return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * Данные, введённые при оформлении: связь по заказу, получатель, оплата,
 * реквизиты организации и комментарий. Пустые поля не показываются.
 *
 * Номер получателя выводится отдельно только если он НЕ тот же, что номер для
 * связи: иначе панель дважды повторяла бы одно число, и главное различие —
 * «звонят не получателю» — перестало бы читаться.
 */
export function OrderInfoPanel({
	contact,
	recipient,
	payment,
	company,
	notes,
}: OrderInfoPanelProps) {
	const hasCompany = Boolean(company?.name);
	const showRecipientPhone =
		recipient.phone !== "" && recipient.phone !== contact.phone;

	return (
		<section className={styles.block}>
			<div className={styles.blockHead}>
				<h3 className={styles.blockTitle}>
					<User size={13} aria-hidden />
					Данные заказа
				</h3>
			</div>

			<dl className={styles.fields}>
				{contact.phone && (
					<OrderField
						icon={PhoneCall}
						label={
							contact.owner === "recipient"
								? "Менеджер звонит получателю"
								: "Менеджер звонит вам"
						}
						value={contact.phone}
						href={telHref(contact.phone)}
					/>
				)}

				<OrderField icon={User} label="Получатель" value={recipient.fullName} />

				{showRecipientPhone && (
					<OrderField
						icon={Phone}
						label="Телефон получателя"
						value={recipient.phone}
						href={telHref(recipient.phone)}
					/>
				)}

				<OrderField
					icon={Mail}
					label="Почта"
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

				<OrderField
					icon={CreditCard}
					label="Оплата"
					value={PAYMENT_METHOD_LABELS[payment.method]}
				/>

				{hasCompany && company && (
					<>
						{company.name && (
							<OrderField
								icon={Building2}
								label="Организация"
								value={company.name}
							/>
						)}
						{company.taxNumber && (
							<OrderField
								icon={Building2}
								label="ИНН"
								value={company.taxNumber}
								code
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
								label="Контактное лицо организации"
								value={company.contactPerson}
							/>
						)}
					</>
				)}

				{notes && (
					<OrderField
						icon={MessageSquareText}
						label="Комментарий к заказу"
						value={notes}
					/>
				)}
			</dl>
		</section>
	);
}

export default OrderInfoPanel;
