"use client";

import { Building2, Check } from "lucide-react";
import { useState } from "react";
import type { Company } from "@/payload-types";
import { CHECKOUT_FIELD_IDS } from "../lib/checkout-fields";
import type { CheckoutFieldErrors } from "../lib/checkout-schema";
import type { CheckoutCompanyInput } from "../types";
import styles from "./Checkout.module.css";
import { CheckboxRow, Disclosure, TextField } from "./fields";

interface Props {
	value: CheckoutCompanyInput;
	onChange: (next: CheckoutCompanyInput) => void;
	companies: Company[];
	errors: CheckoutFieldErrors;
	onFieldBlur: (path: string) => void;
}

/**
 * Плательщик: частное лицо или организация.
 *
 * Весь раздел — один переключатель и то, что он раскрывает. Реквизиты нужны
 * меньшинству заказов, и держать их развёрнутыми для всех значило бы удлинять
 * форму ради тех, кто их не заполняет.
 *
 * Сохранённые организации показываются первыми: у постоянного покупателя
 * заказ от юрлица — это одно нажатие, а не двенадцать полей заново.
 * Принадлежность выбранной организации проверяет СЕРВЕР (см.
 * checkout.actions.ts): id приходит из формы, то есть полностью управляется
 * клиентом, и без проверки заказ можно было бы привязать к чужой организации.
 */
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
		<>
			<CheckboxRow
				checked={value.isCompany}
				onChange={(checked) => onChange({ ...value, isCompany: checked })}
				note="Понадобятся ИНН и юридический адрес — они попадут в счёт"
			>
				Заказ от юридического лица
			</CheckboxRow>

			<Disclosure open={value.isCompany}>
				<div className={styles.group}>
					{companies.length > 0 && (
						<div
							className={`${styles.options} ${styles.optionsPair}`}
							role="group"
							aria-label="Откуда взять реквизиты"
						>
							<button
								type="button"
								onClick={() => setMode("existing")}
								data-selected={mode === "existing" || undefined}
								className={styles.option}
							>
								<span className={styles.optionMark} aria-hidden />
								<span className={styles.optionBody}>
									<span className={styles.optionTitle}>
										Сохранённые компании
									</span>
									<span className={styles.optionText}>
										{companies.length === 1
											? "Одна организация"
											: `${companies.length} организации`}
									</span>
								</span>
							</button>
							<button
								type="button"
								onClick={() => {
									setMode("new");
									onChange({ ...value, existingCompanyId: undefined });
								}}
								data-selected={mode === "new" || undefined}
								className={styles.option}
							>
								<span className={styles.optionMark} aria-hidden />
								<span className={styles.optionBody}>
									<span className={styles.optionTitle}>Новая компания</span>
									<span className={styles.optionText}>
										Ввести реквизиты вручную
									</span>
								</span>
							</button>
						</div>
					)}

					{mode === "existing" && companies.length > 0 && (
						<>
							<div
								id={CHECKOUT_FIELD_IDS.companyExisting}
								role="radiogroup"
								aria-label="Организация"
								aria-invalid={existingCompanyError ? true : undefined}
								aria-describedby={
									existingCompanyError
										? `${CHECKOUT_FIELD_IDS.companyExisting}-error`
										: undefined
								}
								className={`${styles.options} ${
									existingCompanyError ? styles.optionsInvalid : ""
								}`}
							>
								{companies.map((company) => {
									const isSelected =
										value.existingCompanyId === String(company.id);
									return (
										<button
											key={company.id}
											type="button"
											role="radio"
											aria-checked={isSelected}
											onClick={() => selectCompany(company)}
											data-selected={isSelected || undefined}
											className={styles.option}
										>
											<span className={styles.optionIcon}>
												<Building2 size={16} aria-hidden />
											</span>
											<span className={styles.optionBody}>
												<span className={styles.optionTitle}>
													{company.companyName}
												</span>
												<span className={styles.optionText}>
													ИНН {company.taxNumber}
												</span>
											</span>
											{isSelected && (
												<Check
													size={15}
													strokeWidth={3}
													aria-hidden
													className={styles.optionCheck}
												/>
											)}
										</button>
									);
								})}
							</div>
							{existingCompanyError && (
								<p
									id={`${CHECKOUT_FIELD_IDS.companyExisting}-error`}
									role="alert"
									className={styles.fieldError}
								>
									{existingCompanyError}
								</p>
							)}
						</>
					)}

					{mode === "new" && (
						<div className={styles.group}>
							<TextField
								id={CHECKOUT_FIELD_IDS.companyName}
								label="Название компании"
								autoComplete="organization"
								placeholder="ООО «Ромашка»"
								value={value.companyName ?? ""}
								onChange={(e) =>
									onChange({ ...value, companyName: e.target.value })
								}
								onBlur={() => onFieldBlur("company.companyName")}
								error={errors["company.companyName"]}
								required
							/>
							<TextField
								id={CHECKOUT_FIELD_IDS.companyLegalAddress}
								label="Юридический адрес"
								placeholder="Как в ЕГРЮЛ"
								value={value.legalAddress ?? ""}
								onChange={(e) =>
									onChange({ ...value, legalAddress: e.target.value })
								}
								onBlur={() => onFieldBlur("company.legalAddress")}
								error={errors["company.legalAddress"]}
								required
							/>
							<TextField
								label="Фактический адрес"
								placeholder="Если отличается от юридического"
								optionalNote="необязательно"
								value={value.companyAddress ?? ""}
								onChange={(e) =>
									onChange({ ...value, companyAddress: e.target.value })
								}
							/>
							<div className={styles.pair}>
								<TextField
									id={CHECKOUT_FIELD_IDS.companyTaxNumber}
									label="ИНН"
									inputMode="numeric"
									numeric
									placeholder="10 или 12 цифр"
									value={value.taxNumber ?? ""}
									onChange={(e) =>
										onChange({
											...value,
											taxNumber: e.target.value.replace(/\D/g, "").slice(0, 12),
										})
									}
									onBlur={() => onFieldBlur("company.taxNumber")}
									error={errors["company.taxNumber"]}
									hint="Проверяем по контрольной сумме"
									required
								/>
								<TextField
									label="Контактное лицо"
									placeholder="Кто подпишет документы"
									optionalNote="необязательно"
									value={value.contactPerson ?? ""}
									onChange={(e) =>
										onChange({ ...value, contactPerson: e.target.value })
									}
								/>
							</div>
							<CheckboxRow
								checked={value.saveCompany}
								onChange={(checked) =>
									onChange({ ...value, saveCompany: checked })
								}
								note="Реквизиты появятся в списке при следующем заказе"
							>
								Сохранить данные компании
							</CheckboxRow>
						</div>
					)}
				</div>
			</Disclosure>
		</>
	);
}
