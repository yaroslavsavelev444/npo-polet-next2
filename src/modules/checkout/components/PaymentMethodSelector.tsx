"use client";

import { Banknote, CreditCard, FileText } from "lucide-react";
import { cn } from "@/utils/cn";
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
}

export function PaymentMethodSelector({ value, onChange, available }: Props) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
        Способ оплаты
      </h2>
      <div className="flex flex-col gap-2">
        {available.map((method) => {
          const { label, description, icon: Icon } = OPTIONS[method];
          const isActive = value === method;
          return (
            <button
              key={method}
              type="button"
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
    </div>
  );
}
