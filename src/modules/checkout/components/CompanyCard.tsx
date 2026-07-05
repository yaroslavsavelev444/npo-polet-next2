"use client";

import { Building2, Check } from "lucide-react";
import type { Company } from "@/payload-types";
import { cn } from "@/utils/cn";

interface Props {
  company: Company;
  isSelected: boolean;
  onSelect: () => void;
}

export function CompanyCard({ company, isSelected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-[var(--radius-md)] border p-3 text-left transition-colors",
        isSelected
          ? "border-[var(--primary)] bg-[var(--primary)]/5"
          : "border-[var(--border)] hover:border-[var(--border-light)]",
      )}
    >
      <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
          {company.companyName}
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          ИНН {company.taxNumber}
        </p>
      </div>
      {isSelected && (
        <Check className="h-4 w-4 shrink-0 text-[var(--primary)]" />
      )}
    </button>
  );
}
