"use client";

import { Banknote, CreditCard, FileText } from "lucide-react";
import { cn } from "@/utils/cn";
import { CHECKOUT_FIELD_IDS } from "../lib/checkout-fields";
import type { CheckoutPaymentMethod } from "../types";

const OPTIONS: Record<
	CheckoutPaymentMethod,
	{ label: string; description: string; icon: typeof Banknote }
> = {
	invoice: {
		label: "Банковский перевод по счету",
		description: "Счёт с реквизитами будет прикреплён к заказу",
		icon: FileText,
	},
	self_pickup_card: {
		label: "Картой при самовывозе",
		description: "Оплата картой в пункте выдачи",
		icon: CreditCard,
	},
	self_pickup_cash: {
		label: "Наличными при самовывозе",
		description: "Оплата наличными в пункте выдачи",
		icon: Banknote,
	},
};

interface Props {
	value: CheckoutPaymentMethod;
	onChange: (next: CheckoutPaymentMethod) => void;
	available: CheckoutPaymentMethod[];
	error?: string;
}

export function PaymentMethodSelector({
	value,
	onChange,
	available,
	error,
}: Props) {
	return (
		<div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
			<h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
				Способ оплаты
			</h2>
			<div
				id={CHECKOUT_FIELD_IDS.payment}
				role="radiogroup"
				aria-label="Способ оплаты"
				aria-invalid={error ? true : undefined}
				className={cn(
					"flex flex-col gap-2 rounded-[var(--radius-md)]",
					error && "p-2 outline outline-1 outline-[var(--error)]/50",
				)}
			>
				{available.map((method) => {
					const { label, description, icon: Icon } = OPTIONS[method];
					const isActive = value === method;
					return (
						<button
							key={method}
							type="button"
							role="radio"
							aria-checked={isActive}
							onClick={() => onChange(method)}
							className={cn(
								"flex items-center gap-3 rounded-[var(--radius-md)] border p-3 text-left transition-colors",
								isActive
									? "border-[var(--primary)] bg-[var(--primary)]/5"
									: "border-[var(--border)] hover:border-[var(--border-light)]",
							)}
						>
							<Icon
								className={cn(
									"h-5 w-5 shrink-0",
									isActive
										? "text-[var(--primary)]"
										: "text-[var(--text-secondary)]",
								)}
							/>
							<div>
								<p className="text-sm font-medium text-[var(--text-primary)]">
									{label}
								</p>
								<p className="text-xs text-[var(--text-secondary)]">
									{description}
								</p>
							</div>
						</button>
					);
				})}
			</div>
			{error && (
				<p className="mt-1.5 text-xs leading-none text-[var(--error)]">
					{error}
				</p>
			)}
		</div>
	);
}
