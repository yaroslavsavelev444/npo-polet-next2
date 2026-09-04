"use client";

import { useState } from "react";
import type { Company } from "@/payload-types";
import { Input } from "@/UI";
import { cn } from "@/utils/cn";
import { CHECKOUT_FIELD_IDS } from "../lib/checkout-fields";
import type { CheckoutFieldErrors } from "../lib/checkout-schema";
import type { CheckoutCompanyInput } from "../types";
import { CompanyCard } from "./CompanyCard";

interface Props {
	value: CheckoutCompanyInput;
	onChange: (next: CheckoutCompanyInput) => void;
	companies: Company[];
	errors: CheckoutFieldErrors;
	onFieldBlur: (path: string) => void;
}

export function CompanySection({
	value,
	onChange,
	companies,
	errors,
	onFieldBlur,
}: Props) {
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

	const existingCompanyError = errors["company.existingCompanyId"];

	return (
		<div className="rounded-[var(--radius-lg)] border border-(--border) bg-(--surface) p-6">
			<label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-(--text-primary)">
				<input
					type="checkbox"
					checked={value.isCompany}
					onChange={(e) => onChange({ ...value, isCompany: e.target.checked })}
					className="h-4 w-4 shrink-0 accent-(--primary)"
				/>
				Заказ от юридического лица
			</label>

			{value.isCompany && (
				<div className="mt-5 flex flex-col gap-4">
					{companies.length > 0 && (
						<div className="flex gap-2 text-sm">
							<button
								type="button"
								onClick={() => setMode("existing")}
								className={
									mode === "existing"
										? "font-medium text-(--primary)"
										: "text-(--text-secondary) hover:text-(--text-primary)"
								}
							>
								Сохранённые компании
							</button>
							<span className="text-(--text-muted)">/</span>
							<button
								type="button"
								onClick={() => {
									setMode("new");
									onChange({ ...value, existingCompanyId: undefined });
								}}
								className={
									mode === "new"
										? "font-medium text-(--primary)"
										: "text-(--text-secondary) hover:text-(--text-primary)"
								}
							>
								Новая компания
							</button>
						</div>
					)}

					{mode === "existing" && companies.length > 0 && (
						<div className="flex flex-col gap-1.5">
							<div
								id={CHECKOUT_FIELD_IDS.companyExisting}
								role="radiogroup"
								aria-label="Организация"
								aria-invalid={existingCompanyError ? true : undefined}
								className={cn(
									"flex flex-col gap-2 rounded-[var(--radius-md)]",
									existingCompanyError &&
										"p-2 outline outline-1 outline-(--error)/50",
								)}
							>
								{companies.map((c) => (
									<CompanyCard
										key={c.id}
										company={c}
										isSelected={value.existingCompanyId === String(c.id)}
										onSelect={() => selectCompany(c)}
									/>
								))}
							</div>
							{existingCompanyError && (
								<p className="text-xs leading-none text-(--error)">
									{existingCompanyError}
								</p>
							)}
						</div>
					)}

					{mode === "new" && (
						<div className="flex flex-col gap-4">
							<Input
								id={CHECKOUT_FIELD_IDS.companyName}
								label="Название компании"
								autoComplete="organization"
								value={value.companyName ?? ""}
								onChange={(e) =>
									onChange({ ...value, companyName: e.target.value })
								}
								onBlur={() => onFieldBlur("company.companyName")}
								errorMessage={errors["company.companyName"]}
								required
							/>
							<Input
								id={CHECKOUT_FIELD_IDS.companyLegalAddress}
								label="Юридический адрес"
								value={value.legalAddress ?? ""}
								onChange={(e) =>
									onChange({ ...value, legalAddress: e.target.value })
								}
								onBlur={() => onFieldBlur("company.legalAddress")}
								errorMessage={errors["company.legalAddress"]}
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
									id={CHECKOUT_FIELD_IDS.companyTaxNumber}
									label="ИНН"
									inputMode="numeric"
									value={value.taxNumber ?? ""}
									onChange={(e) =>
										onChange({
											...value,
											taxNumber: e.target.value.replace(/\D/g, "").slice(0, 12),
										})
									}
									onBlur={() => onFieldBlur("company.taxNumber")}
									errorMessage={errors["company.taxNumber"]}
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
							<label className="flex cursor-pointer items-center gap-2.5 text-sm text-(--text-secondary)">
								<input
									type="checkbox"
									checked={value.saveCompany}
									onChange={(e) =>
										onChange({ ...value, saveCompany: e.target.checked })
									}
									className="h-4 w-4 shrink-0 accent-(--primary)"
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
