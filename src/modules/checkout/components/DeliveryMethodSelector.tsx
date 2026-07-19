"use client";

import { CheckCircle2, Home, Info, Package, Store } from "lucide-react";
import { Input } from "@/UI/Input/Input";
import { cn } from "@/utils/cn";
import type {
	CheckoutDeliveryInput,
	PickupPointOption,
	TransportCompanyOption,
} from "../types";

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

interface Props {
	value: CheckoutDeliveryInput;
	onChange: (next: CheckoutDeliveryInput) => void;
	pickupPoints: PickupPointOption[];
	transportCompanies: TransportCompanyOption[];
}

export function DeliveryMethodSelector({
	value,
	onChange,
	pickupPoints,
	transportCompanies,
}: Props) {
	const address = value.address ?? {
		city: "",
		street: "",
		house: "",
		apartment: "",
		postalCode: "",
		country: "Россия",
	};

	const hasDetails =
		value.method === "door_to_door" ||
		value.method === "pickup_point" ||
		value.method === "self_pickup";

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

			{hasDetails && (
				<div className="mt-6 flex flex-col gap-4 border-t border-(--border) pt-6">
					{/* Transport company (door_to_door / pickup_point) */}
					{(value.method === "door_to_door" ||
						value.method === "pickup_point") && (
						<div>
							<label
								htmlFor="transport-company"
								className="mb-1.5 block text-sm font-medium text-(--text-primary)"
							>
								Транспортная компания
							</label>
							{transportCompanies.length === 0 ? (
								<InlineNotice>Нет доступных транспортных компаний</InlineNotice>
							) : (
								<select
									id="transport-company"
									value={value.transportCompanyId ?? ""}
									onChange={(e) =>
										onChange({
											...value,
											transportCompanyId: e.target.value || undefined,
										})
									}
									className="w-full rounded-[var(--radius-sm)] border border-(--border) bg-transparent px-3 py-2.5 text-sm outline-none transition-colors focus:border-(--primary)"
								>
									<option value="">Выберите компанию</option>
									{transportCompanies.map((tc) => (
										<option key={tc.id} value={tc.id}>
											{tc.name}
										</option>
									))}
								</select>
							)}
						</div>
					)}

					{/* Address (door_to_door full address) */}
					{value.method === "door_to_door" && (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<Input
								label="Город"
								placeholder="Например, Москва"
								value={address.city}
								onChange={(e) =>
									onChange({
										...value,
										address: { ...address, city: e.target.value },
									})
								}
								required
								wrapperClassName="sm:col-span-2"
							/>
							<Input
								label="Улица"
								placeholder="Например, Ленина"
								value={address.street}
								onChange={(e) =>
									onChange({
										...value,
										address: { ...address, street: e.target.value },
									})
								}
								required
								wrapperClassName="sm:col-span-2"
							/>
							<Input
								label="Дом"
								placeholder="Например, 12к1"
								value={address.house}
								onChange={(e) =>
									onChange({
										...value,
										address: { ...address, house: e.target.value },
									})
								}
								required
							/>
							<Input
								label="Квартира / офис"
								placeholder="Необязательно"
								value={address.apartment}
								onChange={(e) =>
									onChange({
										...value,
										address: { ...address, apartment: e.target.value },
									})
								}
							/>
							<Input
								label="Индекс"
								placeholder="6 цифр"
								inputMode="numeric"
								value={address.postalCode}
								onChange={(e) => {
									const val = e.target.value.replace(/\D/g, "").slice(0, 6);
									onChange({
										...value,
										address: { ...address, postalCode: val },
									});
								}}
								required
								wrapperClassName="sm:col-span-2"
							/>
						</div>
					)}

					{/* Destination city (pickup_point) */}
					{value.method === "pickup_point" && (
						<Input
							label="Город назначения"
							placeholder="Город назначения"
							value={address.city}
							onChange={(e) =>
								onChange({
									...value,
									address: { ...address, city: e.target.value },
								})
							}
						/>
					)}

					{/* Pickup point (self_pickup) */}
					{value.method === "self_pickup" && (
						<div>
							<p className="mb-1.5 text-sm font-medium text-(--text-primary)">
								Пункт самовывоза
							</p>
							{pickupPoints.length === 0 ? (
								<InlineNotice>Нет доступных пунктов самовывоза</InlineNotice>
							) : (
								<div className="flex flex-col gap-2">
									{pickupPoints.map((point) => {
										const isSelected = value.pickupPointId === point.id;
										return (
											<button
												key={point.id}
												type="button"
												onClick={() =>
													onChange({ ...value, pickupPointId: point.id })
												}
												aria-pressed={isSelected}
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
							)}
						</div>
					)}
				</div>
			)}

			{/* Delivery notes + save address */}
			<div className="mt-6 flex flex-col gap-4 border-t border-(--border) pt-6">
				<Input
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
					Сохранить адрес для следующих заказов
				</label>
			</div>
		</div>
	);
}
