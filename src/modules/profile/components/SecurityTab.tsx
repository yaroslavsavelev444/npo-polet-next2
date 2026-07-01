"use client";

import { useState, useTransition } from "react";
import type { ChangePasswordPayload } from "../types/profile.types";
import { validatePassword } from "@/utils/validatePassword";
import { Block, Button, Input } from "@/UI";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  oldPassword:     string;
  newPassword:     string;
  confirmPassword: string;
}

interface FormErrors {
  oldPassword?:     string;
  newPassword?:     string;
  confirmPassword?: string;
}

interface SecurityTabProps {
  onChangePassword: (payload: ChangePasswordPayload) => Promise<void>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SecurityTab({ onChangePassword }: SecurityTabProps) {
  const [form, setForm] = useState<FormState>({
    oldPassword:     "",
    newPassword:     "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isPending, startTransition] = useTransition();

  // ─── Field-level update ─────────────────────────────────────────────────────

  function setField(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear inline error as user types
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };
  }

  // ─── Blur-time validation ───────────────────────────────────────────────────

  function handleBlur(field: keyof FormState) {
    return () => {
      if (!form[field]) return; // Don't yell at empty fields on blur

      const next: FormErrors = { ...errors };

      if (field === "newPassword") {
        const err = validatePassword(form.newPassword);
        if (err) next.newPassword = err;
      }

      if (field === "confirmPassword" && form.newPassword) {
        if (form.newPassword !== form.confirmPassword) {
          next.confirmPassword = "Пароли не совпадают";
        }
      }

      setErrors(next);
    };
  }

  // ─── Submit validation ──────────────────────────────────────────────────────

  function validate(): boolean {
    const next: FormErrors = {};

    if (!form.oldPassword)     next.oldPassword     = "Введите текущий пароль";
    if (!form.newPassword)     next.newPassword     = "Введите новый пароль";
    if (!form.confirmPassword) next.confirmPassword = "Подтвердите новый пароль";

    if (form.newPassword) {
      const err = validatePassword(form.newPassword);
      if (err) next.newPassword = err;
    }

    if (form.newPassword && form.confirmPassword && form.newPassword !== form.confirmPassword) {
      next.confirmPassword = "Пароли не совпадают";
    }

    if (form.oldPassword && form.newPassword && form.oldPassword === form.newPassword) {
      next.newPassword = "Новый пароль должен отличаться от текущего";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────

  function handleSubmit() {
    if (!validate()) return;
    startTransition(async () => {
      await onChangePassword({
        oldPassword: form.oldPassword,
        newPassword: form.newPassword,
      });
      // Reset on success — if the parent throws, the form keeps its state
      setForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
      setErrors({});
    });
  }

  const canSubmit = !!form.oldPassword && !!form.newPassword && !!form.confirmPassword;

  return (
    <Block
      variant="ghost"
      noPadding
      title="Смена пароля"
      subtitle="Используйте надёжный пароль для защиты аккаунта"
    >
      <div className="flex flex-col gap-4 mt-4">
        <Input
          label="Текущий пароль"
          type="password"
          value={form.oldPassword}
          onChange={setField("oldPassword")}
          onBlur={handleBlur("oldPassword")}
          placeholder="Введите текущий пароль"
          errorMessage={errors.oldPassword}
          disabled={isPending}
          autoComplete="current-password"
        />

        <Input
          label="Новый пароль"
          type="password"
          value={form.newPassword}
          onChange={setField("newPassword")}
          onBlur={handleBlur("newPassword")}
          placeholder="Введите новый пароль"
          errorMessage={errors.newPassword}
          helperText={
            errors.newPassword
              ? undefined
              : "8–16 символов: заглавная, строчная, цифра, спецсимвол"
          }
          disabled={isPending}
          autoComplete="new-password"
        />

        <Input
          label="Подтверждение пароля"
          type="password"
          value={form.confirmPassword}
          onChange={setField("confirmPassword")}
          onBlur={handleBlur("confirmPassword")}
          placeholder="Повторите новый пароль"
          errorMessage={errors.confirmPassword}
          disabled={isPending}
          autoComplete="new-password"
        />

        <Button
          variant="primary"
          fullWidth
          disabled={!canSubmit || isPending}
          loading={isPending}
          onClick={handleSubmit}
          className="mt-2"
        >
          Сохранить новый пароль
        </Button>
      </div>
    </Block>
  );
}