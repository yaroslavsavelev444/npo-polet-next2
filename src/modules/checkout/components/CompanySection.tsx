"use client";

import { useState } from "react";
import type { Company } from "@/payload-types";
import { Input } from "@/UI";
import { validateInn } from "../lib/validate-inn";
import type { CheckoutCompanyInput } from "../types";
import { CompanyCard } from "./CompanyCard";

interface Props {
  value: CheckoutCompanyInput;
  onChange: (next: CheckoutCompanyInput) => void;
  companies: Company[];
}

export function CompanySection({ value, onChange, companies }: Props) {
  const [mode, setMode] = useState<"existing" | "new">(
    companies.length > 0 ? "existing" : "new",
  );

  function selectCompany(company: Company) {
    onChange({
      ...value,
      existingCompanyId: String(company.id),
      companyName: company.companyName,
      legalAddress: company.legalAddress,
      companyAddress: company.companyAddress ?? undefined,
      taxNumber: company.taxNumber,
      contactPerson: company.contactPerson ?? undefined,
    });
  }

  const innError = value.taxNumber ? validateInn(value.taxNumber) : undefined;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={value.isCompany}
          onChange={(e) => onChange({ ...value, isCompany: e.target.checked })}
        />
        Заказ от юридического лица
      </label>

      {value.isCompany && (
        <div className="mt-4 flex flex-col gap-4">
          {companies.length > 0 && (
            <div className="flex gap-2 text-sm">
              <button
                type="button"
                onClick={() => setMode("existing")}
                className={
                  mode === "existing"
                    ? "font-medium text-[var(--primary)]"
                    : "text-[var(--text-secondary)]"
                }
              >
                Сохранённые компании
              </button>
              <span className="text-[var(--text-muted)]">/</span>
              <button
                type="button"
                onClick={() => {
                  setMode("new");
                  onChange({ ...value, existingCompanyId: undefined });
                }}
                className={
                  mode === "new"
                    ? "font-medium text-[var(--primary)]"
                    : "text-[var(--text-secondary)]"
                }
              >
                Новая компания
              </button>
            </div>
          )}

          {mode === "existing" && companies.length > 0 && (
            <div className="flex flex-col gap-2">
              {companies.map((c) => (
                <CompanyCard
                  key={c.id}
                  company={c}
                  isSelected={value.existingCompanyId === String(c.id)}
                  onSelect={() => selectCompany(c)}
                />
              ))}
            </div>
          )}

          {mode === "new" && (
            <div className="flex flex-col gap-4">
              <Input
                label="Название компании"
                value={value.companyName ?? ""}
                onChange={(e) =>
                  onChange({ ...value, companyName: e.target.value })
                }
                required
              />
              <Input
                label="Юридический адрес"
                value={value.legalAddress ?? ""}
                onChange={(e) =>
                  onChange({ ...value, legalAddress: e.target.value })
                }
                required
              />
              <Input
                label="Фактический адрес"
                value={value.companyAddress ?? ""}
                onChange={(e) =>
                  onChange({ ...value, companyAddress: e.target.value })
                }
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="ИНН"
                  value={value.taxNumber ?? ""}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      taxNumber: e.target.value.replace(/\D/g, "").slice(0, 12),
                    })
                  }
                  errorMessage={innError ?? undefined}
                  required
                />
                <Input
                  label="Контактное лицо"
                  value={value.contactPerson ?? ""}
                  onChange={(e) =>
                    onChange({ ...value, contactPerson: e.target.value })
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={value.saveCompany}
                  onChange={(e) =>
                    onChange({ ...value, saveCompany: e.target.checked })
                  }
                />
                Сохранить данные компании
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
