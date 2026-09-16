"use client";

import { Check, Home, Info, MapPin, Package, Store, Truck } from "lucide-react";
import type { ComponentType } from "react";
import { type CheckoutAddress, createEmptyAddress } from "../lib/address";
import { CHECKOUT_FIELD_IDS } from "../lib/checkout-fields";
import { DELIVERY_OPTIONS } from "../lib/checkout-labels";
import type { CheckoutFieldErrors } from "../lib/checkout-schema";
import type {
	CheckoutDeliveryInput,
	CheckoutDeliveryMethod,
	PickupPointOption,
	TransportCompanyOption,
} from "../types";
import { AddressAutocomplete } from "./AddressAutocomplete";
import styles from "./Checkout.module.css";
import { CheckboxRow, SelectField, TextField } from "./fields";

const METHOD_ICONS: Record<
	CheckoutDeliveryMethod,
	ComponentType<{ size?: number | string; "aria-hidden"?: boolean }>
> = {
	door_to_door: Home,
	pickup_point: Package,
	self_pickup: Store,
};

const METHOD_ORDER: CheckoutDeliveryMethod[] = [
	"self_pickup",
	"pickup_point",
	"door_to_door",
];

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

/**
 * Способ получения заказа.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ИЗМЕНИЛОСЬ ПО СУЩЕСТВУ
 * ────────────────────────────────────────────────────────────────────────────
 * У каждого варианта теперь подписано, во что он обойдётся. Раньше три
 * способа отличались только названием, и вопрос «а сколько стоит доставка»
 * оставался без ответа до самого конца — да и там ответа не было. Цифры у
 * доставки в этом магазине нет (перевозчик считает её по своему тарифу уже
 * после оформления, в заказ она пишется нулём), поэтому вместо выдуманного
 * «0 ₽» подписано условие: «по тарифу перевозчика» или «бесплатно».
 *
 * Порядок вариантов — от самого простого к самому требовательному: самовывоз
 * не просит ничего, кроме выбора пункта; ПВЗ добавляет перевозчика и адрес;
 * курьер — ещё и индекс с данными для подъезда. Самовывоз стоит первым и
 * потому, что он же выбран по умолчанию (см. CheckoutPageClient): выбранный
 * вариант, стоящий третьим, заставляет глаз возвращаться.
 *
 * Поля показываются ТОЛЬКО для выбранного способа: у самовывоза нет ни
 * адреса, ни перевозчика, и место под них не резервируется.
 */
export function DeliverySection({
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

	const needsAddress =
		value.method === "door_to_door" || value.method === "pickup_point";
	const isCourier = value.method === "door_to_door";

	const transportCompanyError = errors["delivery.transportCompanyId"];
	const pickupPointError = errors["delivery.pickupPointId"];

	function updateAddress(next: CheckoutAddress) {
		onChange({ ...value, address: next });
	}

	return (
		<>
			<div
				className={`${styles.options} ${styles.optionsRow}`}
				role="radiogroup"
				aria-label="Способ получения заказа"
			>
				{METHOD_ORDER.map((method) => {
					const copy = DELIVERY_OPTIONS[method];
					const Icon = METHOD_ICONS[method];
					const isActive = value.method === method;

					return (
						<button
							key={method}
							type="button"
							// role="radio" вместо aria-pressed: способ ровно один, и
							// скринридер обязан сказать «1 из 3», а не «нажато».
							role="radio"
							aria-checked={isActive}
							onClick={() => onChange({ ...value, method })}
							data-selected={isActive || undefined}
							className={`${styles.option} ${styles.optionStacked}`}
						>
							{isActive && (
								<Check
									size={15}
									strokeWidth={3}
									aria-hidden
									className={styles.optionCheck}
								/>
							)}
							<span className={styles.optionIcon}>
								<Icon size={18} aria-hidden />
							</span>
							<span className={styles.optionBody}>
								<span className={styles.optionTitle}>{copy.label}</span>
								<span className={styles.optionText}>{copy.description}</span>
								<span className={styles.optionCost}>{copy.costShort}</span>
							</span>
						</button>
					);
				})}
			</div>

			{/* ── Самовывоз: пункт выдачи ─────────────────────────────────── */}
			{value.method === "self_pickup" && (
				<div className={styles.group}>
					<p className={styles.groupLabel}>
						<Store size={13} aria-hidden />
						Пункт самовывоза
					</p>

					{pickupPoints.length === 0 ? (
						<p className={`${styles.notice} ${styles.noticeWarn}`}>
							<Info size={15} aria-hidden className={styles.noticeIcon} />
							<span>
								Сейчас нет доступных пунктов самовывоза. Выберите доставку — или
								свяжитесь с нами, мы подскажем, где забрать заказ.
							</span>
						</p>
					) : (
						<>
							<div
								id={CHECKOUT_FIELD_IDS.pickupPoint}
								role="radiogroup"
								aria-label="Пункт самовывоза"
								aria-invalid={pickupPointError ? true : undefined}
								aria-describedby={
									pickupPointError
										? `${CHECKOUT_FIELD_IDS.pickupPoint}-error`
										: undefined
								}
								className={`${styles.options} ${
									pickupPointError ? styles.optionsInvalid : ""
								}`}
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
											data-selected={isSelected || undefined}
											className={styles.option}
										>
											<span className={styles.optionMark} aria-hidden />
											<span className={styles.optionBody}>
												<span className={styles.optionTitle}>{point.name}</span>
												<span className={styles.optionText}>
													{point.address}
												</span>
												{point.workingHours && (
													<span className={styles.optionNote}>
														{point.workingHours}
													</span>
												)}
											</span>
										</button>
									);
								})}
							</div>
							{pickupPointError && (
								<p
									id={`${CHECKOUT_FIELD_IDS.pickupPoint}-error`}
									role="alert"
									className={styles.fieldError}
								>
									{pickupPointError}
								</p>
							)}
						</>
					)}
				</div>
			)}

			{/* ── Доставка: перевозчик и адрес ────────────────────────────── */}
			{needsAddress && (
				<div className={styles.group}>
					<p className={styles.groupLabel}>
						<Truck size={13} aria-hidden />
						Куда везём
					</p>

					{transportCompanies.length === 0 ? (
						<p className={`${styles.notice} ${styles.noticeWarn}`}>
							<Info size={15} aria-hidden className={styles.noticeIcon} />
							<span>
								Нет доступных транспортных компаний. Выберите самовывоз или
								свяжитесь с нами — подберём перевозчика вручную.
							</span>
						</p>
					) : (
						<SelectField
							id={CHECKOUT_FIELD_IDS.transportCompany}
							label="Транспортная компания"
							value={value.transportCompanyId ?? ""}
							error={transportCompanyError}
							hint={DELIVERY_OPTIONS[value.method].costNote}
							required
							onChange={(e) =>
								onChange({
									...value,
									transportCompanyId: e.target.value || undefined,
								})
							}
							onBlur={() => onFieldBlur("delivery.transportCompanyId")}
						>
							<option value="">Выберите компанию</option>
							{transportCompanies.map((company) => (
								<option key={company.id} value={company.id}>
									{company.name}
								</option>
							))}
						</SelectField>
					)}

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
				</div>
			)}

			{/* ── Данные для курьера ───────────────────────────────────────
			    Отдельно от адресной части: справочник адресов их не знает, и в
			    строку поиска они попадать не должны — иначе выбор другой
			    подсказки их затирал бы. */}
			{isCourier && (
				<div className={`${styles.group} ${styles.groupDivided}`}>
					<p className={styles.groupLabel}>
						<MapPin size={13} aria-hidden />
						Как найти вас на месте
					</p>

					<div className={styles.triple}>
						<TextField
							label="Квартира / офис"
							placeholder="Например, 42"
							optionalNote="необязательно"
							value={address.apartment}
							onChange={(e) =>
								updateAddress({ ...address, apartment: e.target.value })
							}
						/>
						<TextField
							label="Подъезд"
							placeholder="Например, 2"
							optionalNote="необязательно"
							inputMode="numeric"
							numeric
							value={address.entrance}
							onChange={(e) =>
								updateAddress({
									...address,
									entrance: e.target.value.slice(0, 10),
								})
							}
						/>
						<TextField
							label="Этаж"
							placeholder="Например, 5"
							optionalNote="необязательно"
							inputMode="numeric"
							numeric
							value={address.floor}
							onChange={(e) =>
								updateAddress({
									...address,
									floor: e.target.value.slice(0, 10),
								})
							}
						/>
					</div>
				</div>
			)}

			{/* ── Уточнения к доставке ─────────────────────────────────────── */}
			<div className={`${styles.group} ${styles.groupDivided}`}>
				<TextField
					label="Комментарий к доставке"
					placeholder="Например: позвоните за час"
					optionalNote="необязательно"
					maxLength={1000}
					value={value.notes ?? ""}
					onChange={(e) => onChange({ ...value, notes: e.target.value })}
					hint={
						value.method === "self_pickup"
							? "Что важно знать при выдаче заказа"
							: "Что важно знать перевозчику"
					}
				/>

				<CheckboxRow
					checked={value.saveAddress}
					onChange={(checked) => onChange({ ...value, saveAddress: checked })}
					note="В следующий раз способ получения и адрес подставятся сами"
				>
					Сохранить данные доставки для следующих заказов
				</CheckboxRow>
			</div>
		</>
	);
}
