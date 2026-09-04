"use client";

import { CheckCircle2, Home, Info, Package, Store } from "lucide-react";
import { useId } from "react";
import { Input } from "@/UI/Input/Input";
import { cn } from "@/utils/cn";
import { type CheckoutAddress, createEmptyAddress } from "../lib/address";
import { CHECKOUT_FIELD_IDS } from "../lib/checkout-fields";
import type { CheckoutFieldErrors } from "../lib/checkout-schema";
import type {
	CheckoutDeliveryInput,
	PickupPointOption,
	TransportCompanyOption,
} from "../types";
import { AddressAutocomplete } from "./AddressAutocomplete";

const METHODS = [
	{
		value: "door_to_door" as const,
		label: "Курьер до двери",
		icon: Home,
		description: "Доставим по указанному адресу",
	},
	{
		value: "pickup_point" as const,
		label: "Доставка в ПВЗ",
		icon: Package,
		description: "До пункта выдачи транспортной компании",
	},
	{
		value: "self_pickup" as const,
		label: "Самовывоз",
		icon: Store,
		description: "Заберите заказ сами",
	},
];

function InlineNotice({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-dashed border-(--border) px-4 py-3 text-sm text-(--text-secondary)">
			<Info className="h-4 w-4 shrink-0 text-(--text-muted)" aria-hidden />
			<span>{children}</span>
		</div>
	);
}

const MANUAL_FIELD_IDS = {
	city: CHECKOUT_FIELD_IDS.addressCity,
	street: CHECKOUT_FIELD_IDS.addressStreet,
	house: CHECKOUT_FIELD_IDS.addressHouse,
	postalCode: CHECKOUT_FIELD_IDS.addressPostalCode,
};

interface Props {
	value: CheckoutDeliveryInput;
	onChange: (next: CheckoutDeliveryInput) => void;
	pickupPoints: PickupPointOption[];
	transportCompanies: TransportCompanyOption[];
	/** Видимые сейчас ошибки формы (пути схемы → сообщение). */
	errors: CheckoutFieldErrors;
	/** Единое сообщение об адресе для режима подсказок. */
	addressSummaryError?: string;
	onFieldBlur: (path: string) => void;
	suggestionsEnabled: boolean;
	addressManualMode: boolean;
	onAddressManualModeChange: (manual: boolean) => void;
}

export function DeliveryMethodSelector({
	value,
	onChange,
	pickupPoints,
	transportCompanies,
	errors,
	addressSummaryError,
	onFieldBlur,
	suggestionsEnabled,
	addressManualMode,
	onAddressManualModeChange,
}: Props) {
	const address: CheckoutAddress = value.address ?? createEmptyAddress();
	const notesId = useId();

	const needsAddress =
		value.method === "door_to_door" || value.method === "pickup_point";
	const isCourier = value.method === "door_to_door";

	const transportCompanyError = errors["delivery.transportCompanyId"];
	const pickupPointError = errors["delivery.pickupPointId"];

	function updateAddress(next: CheckoutAddress) {
		onChange({ ...value, address: next });
	}

	return (
		<div className="rounded-[var(--radius-lg)] border border-(--border) bg-(--surface) p-6">
			<h2 className="mb-5 text-base font-semibold text-(--text-primary)">
				Способ получения
			</h2>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				{METHODS.map(({ value: method, label, icon: Icon, description }) => {
					const isActive = value.method === method;
					return (
						<button
							key={method}
							type="button"
							onClick={() => onChange({ ...value, method })}
							aria-pressed={isActive}
							className={cn(
								"relative flex flex-col items-start gap-3 rounded-[var(--radius-md)] border p-4 text-left transition-all duration-150",
								isActive
									? "border-(--primary) bg-(--primary)/8"
									: "border-(--border) hover:border-(--border-light) hover:bg-(--surface-secondary)",
							)}
						>
							{isActive && (
								<CheckCircle2
									className="absolute right-3 top-3 h-4 w-4 text-(--primary)"
									aria-hidden
								/>
							)}
							<span
								className={cn(
									"flex h-10 w-10 items-center justify-center rounded-full",
									isActive
										? "bg-(--primary)/15 text-(--primary)"
										: "bg-(--surface-secondary) text-(--text-secondary)",
								)}
							>
								<Icon className="h-5 w-5" aria-hidden />
							</span>
							<span className="flex flex-col gap-1 pr-4">
								<span className="text-sm font-medium text-(--text-primary)">
									{label}
								</span>
								<span className="text-xs leading-relaxed text-(--text-secondary)">
									{description}
								</span>
							</span>
						</button>
					);
				})}
			</div>

			<div className="mt-6 flex flex-col gap-5 border-t border-(--border) pt-6">
				{/* Transport company (door_to_door / pickup_point) */}
				{needsAddress && (
					<div className="flex flex-col gap-1.5">
						<label
							htmlFor={CHECKOUT_FIELD_IDS.transportCompany}
							className="text-sm font-medium leading-none text-(--text-primary)"
						>
							Транспортная компания
						</label>
						{transportCompanies.length === 0 ? (
							<InlineNotice>Нет доступных транспортных компаний</InlineNotice>
						) : (
							<>
								<select
									id={CHECKOUT_FIELD_IDS.transportCompany}
									value={value.transportCompanyId ?? ""}
									aria-invalid={transportCompanyError ? true : undefined}
									aria-describedby={
										transportCompanyError
											? `${CHECKOUT_FIELD_IDS.transportCompany}-error`
											: undefined
									}
									onChange={(e) =>
										onChange({
											...value,
											transportCompanyId: e.target.value || undefined,
										})
									}
									onBlur={() => onFieldBlur("delivery.transportCompanyId")}
									className={cn(
										"w-full rounded-[var(--radius-sm)] border bg-transparent px-3 py-2.5 text-sm outline-none transition-colors",
										transportCompanyError
											? "border-(--error) focus:border-(--error)"
											: "border-(--border) focus:border-(--primary)",
									)}
								>
									<option value="">Выберите компанию</option>
									{transportCompanies.map((tc) => (
										<option key={tc.id} value={tc.id}>
											{tc.name}
										</option>
									))}
								</select>
								{transportCompanyError && (
									<p
										id={`${CHECKOUT_FIELD_IDS.transportCompany}-error`}
										className="text-xs leading-none text-(--error)"
									>
										{transportCompanyError}
									</p>
								)}
							</>
						)}
					</div>
				)}

				{/* Адрес доставки / адрес ПВЗ */}
				{needsAddress && (
					<AddressAutocomplete
						value={address}
						onChange={updateAddress}
						onBlur={() => {
							onFieldBlur("delivery.address.city");
							onFieldBlur("delivery.address.street");
							onFieldBlur("delivery.address.house");
							onFieldBlur("delivery.address.postalCode");
						}}
						onFieldBlur={(field) => onFieldBlur(`delivery.address.${field}`)}
						error={addressSummaryError}
						fieldErrors={{
							city: errors["delivery.address.city"],
							street: errors["delivery.address.street"],
							house: errors["delivery.address.house"],
							postalCode: errors["delivery.address.postalCode"],
						}}
						requirePostalCode={isCourier}
						suggestionsEnabled={suggestionsEnabled}
						manualMode={addressManualMode}
						onManualModeChange={onAddressManualModeChange}
						label={isCourier ? "Адрес доставки" : "Адрес пункта выдачи"}
						placeholder={
							isCourier ? "Город, улица, дом" : "Город и адрес пункта выдачи"
						}
						inputId={CHECKOUT_FIELD_IDS.addressQuery}
						manualFieldIds={MANUAL_FIELD_IDS}
					/>
				)}

				{/* Данные для курьера — отдельно от адресной части: справочник
				    адресов их не знает, и они не должны попадать в строку поиска. */}
				{isCourier && (
					<fieldset className="rounded-[var(--radius-md)] border border-(--border) p-4">
						<legend className="px-1.5 text-xs font-medium uppercase tracking-wider text-(--text-secondary)">
							Данные для курьера
						</legend>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<Input
								label="Квартира / офис"
								placeholder="Необязательно"
								value={address.apartment}
								onChange={(e) =>
									updateAddress({ ...address, apartment: e.target.value })
								}
							/>
							<Input
								label="Подъезд"
								placeholder="Необязательно"
								inputMode="numeric"
								value={address.entrance}
								onChange={(e) =>
									updateAddress({
										...address,
										entrance: e.target.value.slice(0, 10),
									})
								}
							/>
							<Input
								label="Этаж"
								placeholder="Необязательно"
								inputMode="numeric"
								value={address.floor}
								onChange={(e) =>
									updateAddress({
										...address,
										floor: e.target.value.slice(0, 10),
									})
								}
							/>
						</div>
					</fieldset>
				)}

				{/* Pickup point (self_pickup) */}
				{value.method === "self_pickup" && (
					<div className="flex flex-col gap-1.5">
						<p className="text-sm font-medium text-(--text-primary)">
							Пункт самовывоза
						</p>
						{pickupPoints.length === 0 ? (
							<InlineNotice>Нет доступных пунктов самовывоза</InlineNotice>
						) : (
							<>
								<div
									id={CHECKOUT_FIELD_IDS.pickupPoint}
									// Группа выбора: роль radiogroup даёт скринридеру понять,
									// что вариант ровно один, а aria-invalid связывает с ней
									// сообщение об ошибке.
									role="radiogroup"
									aria-label="Пункт самовывоза"
									aria-invalid={pickupPointError ? true : undefined}
									aria-describedby={
										pickupPointError
											? `${CHECKOUT_FIELD_IDS.pickupPoint}-error`
											: undefined
									}
									className={cn(
										"flex flex-col gap-2 rounded-[var(--radius-md)]",
										pickupPointError &&
											"p-2 outline outline-1 outline-(--error)/50",
									)}
								>
									{pickupPoints.map((point) => {
										const isSelected = value.pickupPointId === point.id;
										return (
											<button
												key={point.id}
												type="button"
												role="radio"
												aria-checked={isSelected}
												onClick={() =>
													onChange({ ...value, pickupPointId: point.id })
												}
												className={cn(
													"flex items-start justify-between gap-3 rounded-[var(--radius-md)] border p-3.5 text-left transition-colors",
													isSelected
														? "border-(--primary) bg-(--primary)/8"
														: "border-(--border) hover:border-(--border-light) hover:bg-(--surface-secondary)",
												)}
											>
												<span className="flex flex-col gap-1">
													<span className="text-sm font-medium text-(--text-primary)">
														{point.name}
													</span>
													<span className="text-xs text-(--text-secondary)">
														{point.address}
													</span>
													{point.workingHours && (
														<span className="text-xs text-(--text-muted)">
															{point.workingHours}
														</span>
													)}
												</span>
												{isSelected && (
													<CheckCircle2
														className="h-4 w-4 shrink-0 text-(--primary)"
														aria-hidden
													/>
												)}
											</button>
										);
									})}
								</div>
								{pickupPointError && (
									<p
										id={`${CHECKOUT_FIELD_IDS.pickupPoint}-error`}
										className="text-xs leading-none text-(--error)"
									>
										{pickupPointError}
									</p>
								)}
							</>
						)}
					</div>
				)}
			</div>

			{/* Delivery notes + save address */}
			<div className="mt-6 flex flex-col gap-4 border-t border-(--border) pt-6">
				<Input
					id={notesId}
					label="Комментарий к доставке"
					placeholder="Например: позвоните перед доставкой"
					value={value.notes ?? ""}
					onChange={(e) => onChange({ ...value, notes: e.target.value })}
				/>

				<label className="flex cursor-pointer items-center gap-2.5 text-sm text-(--text-secondary)">
					<input
						type="checkbox"
						checked={value.saveAddress}
						onChange={(e) =>
							onChange({ ...value, saveAddress: e.target.checked })
						}
						className="h-4 w-4 shrink-0 accent-(--primary)"
					/>
					Сохранить данные доставки для следующих заказов
				</label>
			</div>
		</div>
	);
}
