"use client";

import { useState, useTransition } from "react";
import { LogOut, ShieldAlert, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ProfileUser, UpdateAccountPayload } from "../types/profile.types";
import { Block, Button, Input } from "@/UI";

// ─── Validation ───────────────────────────────────────────────────────────────

/** Full name: three Cyrillic words, each starting with uppercase */
const NAME_RE = /^[A-Za-zА-ЯЁа-яё]+(?:[-' ][A-Za-zА-ЯЁа-яё]+)*$/u;

// ─── Props ────────────────────────────────────────────────────────────────────

interface AccountTabProps {
  user: ProfileUser;
  onUpdate: (payload: UpdateAccountPayload) => Promise<void>;
  onLogoutRequest: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountTab({ user, onUpdate, onLogoutRequest }: AccountTabProps) {
  // Инициализируем состояние начальным значением user.name
  // Компонент будет пересоздан при изменении key, поэтому состояние всегда синхронизировано
  const [name, setName] = useState(() => user.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDirty = name.trim() !== user.name.trim();

  function validate(): boolean {
    if (!name.trim()) {
      setNameError("Введите ФИО");
      return false;
    }
    if (!NAME_RE.test(name.trim())) {
      setNameError("Формат: Фамилия Имя Отчество (кириллица)");
      return false;
    }
    setNameError(null);
    return true;
  }

  function handleSave() {
    if (!validate()) return;
    startTransition(async () => {
      await onUpdate({ name: name.trim() });
    });
  }

  return (
    <Block
      variant="ghost"
      noPadding
      title="Информация об аккаунте"
      subtitle="Основные данные вашего профиля"
    >
      <div className="flex flex-col gap-4 mt-4">
        <Input
          label="ФИО"
          placeholder="Фамилия Имя Отчество"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          onBlur={validate}
          errorMessage={nameError ?? undefined}
          disabled={isPending}
          autoComplete="name"
        />

        <Input
          label="Email"
          type="email"
          value={user.email}
          disabled
          readOnly
          helperText="Email нельзя изменить"
        />

        <div className="flex flex-col gap-2 pt-2">
          <Button
            variant="primary"
            fullWidth
            disabled={!isDirty || isPending}
            loading={isPending}
            onClick={handleSave}
          >
            Сохранить изменения
          </Button>

          <Button
            variant="outline"
            fullWidth
            disabled={isPending}
            onClick={onLogoutRequest}
            leftIcon={<LogOut className="w-4 h-4" />}
            className="text-[var(--error)] border-[var(--error)] hover:bg-[var(--error)] hover:text-white"
          >
            Выйти из аккаунта
          </Button>
        </div>

        <div className="mt-6 border-t border-[var(--border)] pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Опасная зона
          </p>

          <Link
            href="/profile/delete-account"
            className="mt-3 flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--error)]/25 bg-[var(--error)]/5 p-4 text-left transition-colors hover:border-[var(--error)]/50 hover:bg-[var(--error)]/10"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--error)]/10 text-[var(--error)]">
              <ShieldAlert className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                Удаление аккаунта
              </span>
              <span className="block text-xs text-[var(--text-secondary)]">
                Безвозвратно удалит профиль и персональные данные
              </span>
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-[var(--error)]"
              aria-hidden
            />
          </Link>
        </div>
      </div>
    </Block>
  );
}
