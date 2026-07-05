"use client";

import { Input } from "@/UI";
import type { CheckoutRecipientInput } from "../types";

const PHONE_RE = /^\+?\d{10,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  value: CheckoutRecipientInput;
  onChange: (next: CheckoutRecipientInput) => void;
}

export function RecipientForm({ value, onChange }: Props) {
  const phoneError =
    value.phone && !PHONE_RE.test(value.phone)
      ? "Некорректный формат телефона"
      : undefined;
  const emailError =
    value.email && !EMAIL_RE.test(value.email)
      ? "Некорректный формат email"
      : undefined;

  return (
    <div className="rounded-lg border border-(--border) bg-(--surface) p-5">
      <h2 className="mb-4 text-base font-semibold text-(--text-primary)">
        Данные получателя
      </h2>

      <div className="flex flex-col gap-4">
        <Input
          label="ФИО получателя"
          value={value.fullName}
          onChange={(e) => onChange({ ...value, fullName: e.target.value })}
          placeholder="Иванов Иван Иванович"
          required
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Телефон"
            type="tel"
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            placeholder="+79991234567"
            errorMessage={phoneError}
            required
          />
          <Input
            label="Email"
            type="email"
            value={value.email}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
            placeholder="ivanov@example.com"
            errorMessage={emailError}
            required
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-(--text-secondary)">
          <input
            type="checkbox"
            checked={value.saveRecipient}
            onChange={(e) =>
              onChange({ ...value, saveRecipient: e.target.checked })
            }
          />
          Сохранить данные получателя
        </label>
      </div>
    </div>
  );
}
