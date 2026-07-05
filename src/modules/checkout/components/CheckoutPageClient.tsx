"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { appToast } from "@/shared/lib/toast";
import { Button } from "@/UI";
import { submitOrderAction } from "../actions/checkout.actions";
import {
  getAvailablePaymentMethods,
  getDefaultPaymentMethod,
  isPaymentMethodCompatible,
} from "../lib/payment-compatibility";
import type {
  CheckoutCompanyInput,
  CheckoutDeliveryInput,
  CheckoutPaymentMethod,
  CheckoutRecipientInput,
  CheckoutView,
} from "../types";
import { CompanySection } from "./CompanySection";
import { DeliveryMethodSelector } from "./DeliveryMethodSelector";
import { OrderConfirmationPanel } from "./OrderConfirmationPanel";
import { OrderItemsSummary } from "./OrderItemsSummary";
import { PaymentMethodSelector } from "./PaymentMethodSelector";
import { RecipientForm } from "./RecipientForm";

interface CheckoutPageClientProps {
  initialView: CheckoutView;
  user: { name: string; email: string };
}

export function CheckoutPageClient({
  initialView,
  user,
}: CheckoutPageClientProps) {
  const router = useRouter();
  const [isSubmitting, startSubmitting] = useTransition();

  const [recipient, setRecipient] = useState<CheckoutRecipientInput>({
    fullName: initialView.savedRecipient?.fullName ?? user.name ?? "",
    phone: initialView.savedRecipient?.phone ?? "",
    email: initialView.savedRecipient?.email ?? user.email ?? "",
    saveRecipient: Boolean(initialView.savedRecipient),
  });

  const [delivery, setDelivery] = useState<CheckoutDeliveryInput>({
    method: initialView.savedDelivery?.method ?? "self_pickup",
    address: {
      street: initialView.savedDelivery?.address?.street ?? "",
      city: initialView.savedDelivery?.address?.city ?? "",
      postalCode: initialView.savedDelivery?.address?.postalCode ?? "",
      country: initialView.savedDelivery?.address?.country ?? "Россия",
    },
    transportCompanyId: initialView.savedDelivery?.transportCompanyId,
    pickupPointId: initialView.savedDelivery?.pickupPointId,
    notes: "",
    saveAddress: Boolean(initialView.savedDelivery),
  });

  const [company, setCompany] = useState<CheckoutCompanyInput>({
    isCompany: false,
    saveCompany: false,
  });

  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>(
    getDefaultPaymentMethod(delivery.method),
  );
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availablePaymentMethods = useMemo(
    () => getAvailablePaymentMethods(delivery.method),
    [delivery.method],
  );

  function handleDeliveryChange(next: CheckoutDeliveryInput) {
    setDelivery(next);
    if (!isPaymentMethodCompatible(next.method, paymentMethod)) {
      setPaymentMethod(getDefaultPaymentMethod(next.method));
    }
  }

  function handleSubmit() {
    setErrorMessage(null);
    startSubmitting(async () => {
      const result = await submitOrderAction({
        recipient,
        delivery,
        company: company.isCompany ? company : undefined,
        paymentMethod,
        notes,
      });

      if (!result.success) {
        setErrorMessage(result.message);
        appToast.warning(result.message);
        return;
      }

      appToast.success(`Заказ №${result.data.orderNumber} оформлен`);
      router.push(`/orders/${result.data.orderNumber}`);
    });
  }

  const isValid =
    initialView.cart.validation.isValid &&
    recipient.fullName &&
    recipient.phone &&
    recipient.email;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-semibold var(--text-primary) sm:text-3xl">
        Оформление заказа
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <OrderItemsSummary items={initialView.cart.items} />

          <DeliveryMethodSelector
            value={delivery}
            onChange={handleDeliveryChange}
            pickupPoints={initialView.pickupPoints}
            transportCompanies={initialView.transportCompanies}
          />

          <RecipientForm value={recipient} onChange={setRecipient} />

          <CompanySection
            value={company}
            onChange={setCompany}
            companies={initialView.companies}
          />

          <PaymentMethodSelector
            value={paymentMethod}
            onChange={setPaymentMethod}
            available={availablePaymentMethods}
          />

          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <label
              htmlFor="order-notes"
              className="mb-2 block text-sm font-medium text-[var(--text-primary)]"
            >
              Комментарий к заказу
            </label>
            <textarea
              id="order-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              placeholder="Необязательно"
            />
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24 flex flex-col gap-4">
            <OrderConfirmationPanel
              cart={initialView.cart}
              recipient={recipient}
              delivery={delivery}
              company={company}
              paymentMethod={paymentMethod}
              notes={notes}
              pickupPoints={initialView.pickupPoints}
              transportCompanies={initialView.transportCompanies}
            />

            {errorMessage && (
              <div className="rounded-[var(--radius-md)] border border-[var(--error)]/30 bg-[var(--error)]/10 p-3 text-sm text-[var(--error)]">
                {errorMessage}
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={!isValid || isSubmitting}
              loading={isSubmitting}
              onClick={handleSubmit}
            >
              Подтвердить заказ
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
