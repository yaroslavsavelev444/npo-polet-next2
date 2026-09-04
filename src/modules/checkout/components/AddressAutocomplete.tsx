"use client";

import { AlertCircle, Loader2, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/UI";
import { cn } from "@/utils/cn";
import {
	MIN_QUERY_LENGTH,
	useAddressSuggestions,
} from "../hooks/useAddressSuggestions";
import {
	type CheckoutAddress,
	composeAddressLine,
	createEmptyAddress,
} from "../lib/address";
import type { AddressSuggestion } from "../types";

/**
 * Поле адреса с подсказками — паттерн ARIA 1.2 combobox с listbox.
 *
 * Компонент отвечает ТОЛЬКО за адресную часть (до дома). Квартира, подъезд и
 * этаж живут отдельными полями вне его: справочник их не знает, и подмешивать
 * их в строку поиска означало бы терять их при выборе другой подсказки.
 *
 * Два режима:
 *  • подсказки — одно поле поиска, выбор из списка заполняет все компоненты;
 *  • ручной ввод — город/улица/дом/корпус/индекс по отдельности.
 * Ручной режим не запасной вариант «на всякий случай», а полноценный путь:
 * DaData не знает новостроек и адресов вне РФ, а её дневная квота может
 * закончиться. Он включается сам, если подсказки недоступны.
 */

interface Props {
	value: CheckoutAddress;
	onChange: (next: CheckoutAddress) => void;
	/** Поле «тронуто» — можно показывать ошибку. */
	onBlur?: () => void;
	/** Сообщение об ошибке адреса (общее для режима подсказок). */
	error?: string;
	/** Индекс требуется (курьер) — показываем его и в ручном режиме. */
	requirePostalCode?: boolean;
	/** Подсказки настроены на сервере. */
	suggestionsEnabled: boolean;
	manualMode: boolean;
	onManualModeChange: (manual: boolean) => void;
	/** Ошибки отдельных полей в ручном режиме. */
	fieldErrors?: {
		city?: string;
		street?: string;
		house?: string;
		postalCode?: string;
	};
	onFieldBlur?: (field: "city" | "street" | "house" | "postalCode") => void;
	label: string;
	placeholder: string;
	/** id поля поиска — цель для перехода из общего списка ошибок. */
	inputId: string;
	manualFieldIds: {
		city: string;
		street: string;
		house: string;
		postalCode: string;
	};
}

const DEGRADED_MESSAGES: Record<string, string> = {
	not_configured: "Подсказки адресов сейчас недоступны — введите адрес вручную",
	unavailable:
		"Не удалось загрузить подсказки. Попробуйте ещё раз или введите адрес вручную",
	rate_limited:
		"Слишком много запросов подсказок. Подождите немного или введите адрес вручную",
};

export function AddressAutocomplete({
	value,
	onChange,
	onBlur,
	error,
	requirePostalCode = false,
	suggestionsEnabled,
	manualMode,
	onManualModeChange,
	fieldErrors,
	onFieldBlur,
	label,
	placeholder,
	inputId,
	manualFieldIds,
}: Props) {
	// Строка поиска отражает адрес, но не равна ему: пользователь может
	// набирать текст, который ещё не соответствует ни одной подсказке.
	const [query, setQuery] = useState(
		() => value.fullAddress || composeAddressLine(value),
	);
	const [isOpen, setIsOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);

	const listboxId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	// Выбор мышью происходит раньше blur — флаг не даёт закрыть список до того,
	// как отработает клик по подсказке.
	const isSelectingRef = useRef(false);

	const { suggestions, status, degradedReason, isEmpty, retry } =
		useAddressSuggestions({
			query,
			// Не грузим подсказки, пока список закрыт или адрес уже выбран и не
			// редактируется — это главный источник «лишних» запросов.
			enabled: suggestionsEnabled && !manualMode && isOpen,
		});

	// Подсказки недоступны — переводим поле в ручной режим один раз, не мешая
	// пользователю переключиться обратно.
	const hasAutoSwitchedRef = useRef(false);
	useEffect(() => {
		if (manualMode || hasAutoSwitchedRef.current) return;
		if (!suggestionsEnabled || degradedReason === "not_configured") {
			hasAutoSwitchedRef.current = true;
			onManualModeChange(true);
		}
	}, [manualMode, suggestionsEnabled, degradedReason, onManualModeChange]);

	// Внешнее изменение адреса (смена способа доставки, сброс формы) должно
	// доехать до строки поиска.
	const lastSyncedRef = useRef(value.fullAddress);
	useEffect(() => {
		if (value.fullAddress !== lastSyncedRef.current) {
			lastSyncedRef.current = value.fullAddress;
			setQuery(value.fullAddress || composeAddressLine(value));
		}
	}, [value]);

	const activeOptionId =
		activeIndex >= 0 && suggestions[activeIndex]
			? `${listboxId}-option-${activeIndex}`
			: undefined;

	const showList =
		isOpen &&
		!manualMode &&
		(status === "loading" ||
			suggestions.length > 0 ||
			isEmpty ||
			status === "degraded");

	function applySuggestion(suggestion: AddressSuggestion) {
		lastSyncedRef.current = suggestion.address.fullAddress;
		setQuery(suggestion.address.fullAddress);
		onChange({
			...suggestion.address,
			// Квартира/подъезд/этаж введены пользователем и подсказкой не
			// управляются — переносим как есть.
			apartment: value.apartment,
			entrance: value.entrance,
			floor: value.floor,
		});
		setIsOpen(false);
		setActiveIndex(-1);
		// Подсказка до улицы — адрес ещё не полон: оставляем фокус и сразу
		// запускаем следующий поиск, дописав пробел.
		if (!suggestion.isComplete) {
			setQuery(`${suggestion.address.fullAddress}, `);
			setIsOpen(true);
			requestAnimationFrame(() => inputRef.current?.focus());
		}
	}

	function handleQueryChange(next: string) {
		setQuery(next);
		lastSyncedRef.current = next;
		setIsOpen(true);
		setActiveIndex(-1);
		// Ручная правка разрывает связь со справочником: компоненты и
		// идентификаторы, разобранные DaData, больше не описывают то, что
		// набрано в поле. Оставить их — значит отправить заказ по адресу,
		// которого пользователь не видел. Квартира/подъезд/этаж не относятся к
		// адресной части и сохраняются.
		onChange({
			...createEmptyAddress(),
			country: value.country,
			apartment: value.apartment,
			entrance: value.entrance,
			floor: value.floor,
			fullAddress: next,
			source: "manual",
		});
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (manualMode) return;

		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (!isOpen) {
				setIsOpen(true);
				return;
			}
			if (suggestions.length === 0) return;
			const delta = event.key === "ArrowDown" ? 1 : -1;
			setActiveIndex((current) => {
				const next = current + delta;
				if (next < 0) return suggestions.length - 1;
				if (next >= suggestions.length) return 0;
				return next;
			});
			return;
		}

		if (event.key === "Home" && isOpen && suggestions.length > 0) {
			event.preventDefault();
			setActiveIndex(0);
			return;
		}
		if (event.key === "End" && isOpen && suggestions.length > 0) {
			event.preventDefault();
			setActiveIndex(suggestions.length - 1);
			return;
		}

		if (event.key === "Enter") {
			// Enter выбирает подсказку, только когда она подсвечена. Иначе это
			// обычная отправка формы, и перехватывать её нельзя.
			if (isOpen && activeIndex >= 0 && suggestions[activeIndex]) {
				event.preventDefault();
				applySuggestion(suggestions[activeIndex]);
			}
			return;
		}

		if (event.key === "Escape") {
			if (isOpen) {
				event.preventDefault();
				setIsOpen(false);
				setActiveIndex(-1);
			}
			return;
		}

		if (event.key === "Tab") {
			setIsOpen(false);
			setActiveIndex(-1);
		}
	}

	// Держим подсвеченный пункт в зоне видимости при навигации с клавиатуры.
	useEffect(() => {
		if (activeIndex < 0 || !listRef.current) return;
		const option = listRef.current.children[activeIndex];
		if (option instanceof HTMLElement) {
			option.scrollIntoView({ block: "nearest" });
		}
	}, [activeIndex]);

	const helperText = useMemo(() => {
		if (manualMode) return undefined;
		if (query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH) {
			return `Введите не менее ${MIN_QUERY_LENGTH} символов`;
		}
		return "Начните вводить адрес и выберите его из списка";
	}, [manualMode, query]);

	const manualToggle = (
		<button
			type="button"
			onClick={() => {
				const nextManual = !manualMode;
				onManualModeChange(nextManual);
				setIsOpen(false);
				if (!nextManual) {
					// Возврат к подсказкам: переносим то, что уже введено, в строку
					// поиска, чтобы не начинать с нуля.
					setQuery(composeAddressLine(value) || value.fullAddress);
				}
			}}
			className="self-start rounded-[var(--radius-sm)] text-xs font-medium text-(--accent-light) underline-offset-4 transition-colors hover:text-(--accent) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
		>
			{manualMode ? "Вернуться к подсказкам адреса" : "Ввести адрес вручную"}
		</button>
	);

	if (manualMode) {
		return (
			<div className="flex flex-col gap-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Input
						id={manualFieldIds.city}
						label="Город или населённый пункт"
						placeholder="Например, Москва"
						value={value.city}
						onChange={(e) =>
							onChange({
								...value,
								city: e.target.value,
								source: "manual",
								fullAddress: composeAddressLine({
									...value,
									city: e.target.value,
								}),
							})
						}
						onBlur={() => onFieldBlur?.("city")}
						errorMessage={fieldErrors?.city}
						required
						wrapperClassName="sm:col-span-2"
					/>
					<Input
						id={manualFieldIds.street}
						label="Улица"
						placeholder="Например, Ленина"
						value={value.street}
						onChange={(e) =>
							onChange({
								...value,
								street: e.target.value,
								source: "manual",
								fullAddress: composeAddressLine({
									...value,
									street: e.target.value,
								}),
							})
						}
						onBlur={() => onFieldBlur?.("street")}
						errorMessage={fieldErrors?.street}
						required
						wrapperClassName="sm:col-span-2"
					/>
					<Input
						id={manualFieldIds.house}
						label="Дом"
						placeholder="Например, 12"
						value={value.house}
						onChange={(e) =>
							onChange({
								...value,
								house: e.target.value,
								source: "manual",
								fullAddress: composeAddressLine({
									...value,
									house: e.target.value,
								}),
							})
						}
						onBlur={() => onFieldBlur?.("house")}
						errorMessage={fieldErrors?.house}
						required
					/>
					<Input
						label="Корпус / строение"
						placeholder="Необязательно"
						value={value.block}
						onChange={(e) =>
							onChange({
								...value,
								block: e.target.value,
								source: "manual",
								fullAddress: composeAddressLine({
									...value,
									block: e.target.value,
								}),
							})
						}
					/>
					{requirePostalCode && (
						<Input
							id={manualFieldIds.postalCode}
							label="Почтовый индекс"
							placeholder="6 цифр"
							inputMode="numeric"
							autoComplete="postal-code"
							value={value.postalCode}
							onChange={(e) =>
								onChange({
									...value,
									postalCode: e.target.value.replace(/\D/g, "").slice(0, 6),
									source: "manual",
								})
							}
							onBlur={() => onFieldBlur?.("postalCode")}
							errorMessage={fieldErrors?.postalCode}
							required
							wrapperClassName="sm:col-span-2"
						/>
					)}
				</div>
				{suggestionsEnabled && manualToggle}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="relative">
				<Input
					id={inputId}
					ref={inputRef}
					label={label}
					placeholder={placeholder}
					value={query}
					autoComplete="off"
					// Мобильные клавиатуры и браузерное автозаполнение адреса
					// конфликтуют со своим списком подсказок — отключаем оба.
					autoCorrect="off"
					spellCheck={false}
					leftIcon={<Search className="h-4 w-4" aria-hidden />}
					rightIcon={
						status === "loading" ? (
							<Loader2
								className="h-4 w-4 animate-spin text-(--text-muted)"
								aria-hidden
							/>
						) : query ? (
							<button
								type="button"
								aria-label="Очистить адрес"
								className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full text-(--text-muted) transition-colors hover:bg-(--surface-secondary) hover:text-(--text-primary)"
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => {
									setQuery("");
									lastSyncedRef.current = "";
									onChange({
										...createEmptyAddress(),
										country: value.country,
										apartment: value.apartment,
										entrance: value.entrance,
										floor: value.floor,
									});
									inputRef.current?.focus();
									setIsOpen(true);
								}}
							>
								<X className="h-4 w-4" aria-hidden />
							</button>
						) : null
					}
					errorMessage={error}
					helperText={helperText}
					required
					role="combobox"
					aria-expanded={showList}
					aria-controls={showList ? listboxId : undefined}
					aria-autocomplete="list"
					aria-activedescendant={activeOptionId}
					onChange={(e) => handleQueryChange(e.target.value)}
					onKeyDown={handleKeyDown}
					onFocus={() => setIsOpen(true)}
					onBlur={() => {
						if (isSelectingRef.current) return;
						setIsOpen(false);
						setActiveIndex(-1);
						onBlur?.();
					}}
				/>

				{showList && (
					<div
						className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-[var(--radius-md)] border border-(--border-light) bg-(--surface) shadow-[0_12px_32px_-8px_var(--shadow-color)]"
						onMouseDown={() => {
							isSelectingRef.current = true;
						}}
						onMouseUp={() => {
							isSelectingRef.current = false;
						}}
					>
						{status === "loading" && suggestions.length === 0 && (
							<p className="flex items-center gap-2 px-4 py-3 text-sm text-(--text-secondary)">
								<Loader2 className="h-4 w-4 animate-spin" aria-hidden />
								Ищем адрес…
							</p>
						)}

						{suggestions.length > 0 && (
							<ul
								ref={listRef}
								id={listboxId}
								role="listbox"
								aria-label="Варианты адреса"
								className="max-h-72 overflow-y-auto overscroll-contain py-1"
							>
								{suggestions.map((suggestion, index) => {
									const isActive = index === activeIndex;
									return (
										// Клавиатура обслуживается самим полем ввода через
										// aria-activedescendant — это и есть паттерн combobox
										// из ARIA 1.2: фокус остаётся в input, а пункты списка
										// фокус не получают вовсе.
										<li
											key={suggestion.id}
											id={`${listboxId}-option-${index}`}
											role="option"
											aria-selected={isActive}
											onMouseEnter={() => setActiveIndex(index)}
											onClick={() => applySuggestion(suggestion)}
											className={cn(
												// min-h под палец: 44px — минимальная цель касания.
												"flex min-h-11 cursor-pointer items-start gap-2.5 px-4 py-2.5 text-sm transition-colors",
												isActive
													? "bg-(--primary)/12 text-(--text-primary)"
													: "text-(--text-primary) hover:bg-(--surface-secondary)",
											)}
										>
											<MapPin
												className={cn(
													"mt-0.5 h-4 w-4 shrink-0",
													isActive ? "text-(--primary)" : "text-(--text-muted)",
												)}
												aria-hidden
											/>
											<span className="flex min-w-0 flex-col gap-0.5">
												<span className="break-words leading-snug">
													{suggestion.label}
												</span>
												{suggestion.hint && (
													<span className="text-xs text-(--text-secondary)">
														{suggestion.hint}
													</span>
												)}
												{!suggestion.isComplete && (
													<span className="text-xs text-(--text-muted)">
														Уточните номер дома
													</span>
												)}
											</span>
										</li>
									);
								})}
							</ul>
						)}

						{isEmpty && (
							<div className="flex flex-col gap-2 px-4 py-3">
								<p className="text-sm text-(--text-secondary)">
									Ничего не нашлось по запросу «{query.trim()}»
								</p>
								<button
									type="button"
									onClick={() => {
										onManualModeChange(true);
										setIsOpen(false);
									}}
									className="self-start text-xs font-medium text-(--accent-light) underline-offset-4 hover:underline"
								>
									Ввести адрес вручную
								</button>
							</div>
						)}

						{status === "degraded" && degradedReason && (
							<div className="flex flex-col gap-2 px-4 py-3">
								<p className="flex items-start gap-2 text-sm text-(--warning)">
									<AlertCircle
										className="mt-0.5 h-4 w-4 shrink-0"
										aria-hidden
									/>
									{DEGRADED_MESSAGES[degradedReason] ??
										DEGRADED_MESSAGES.unavailable}
								</p>
								<div className="flex gap-3">
									{degradedReason !== "not_configured" && (
										<button
											type="button"
											onClick={retry}
											className="text-xs font-medium text-(--accent-light) underline-offset-4 hover:underline"
										>
											Попробовать снова
										</button>
									)}
									<button
										type="button"
										onClick={() => {
											onManualModeChange(true);
											setIsOpen(false);
										}}
										className="text-xs font-medium text-(--accent-light) underline-offset-4 hover:underline"
									>
										Ввести адрес вручную
									</button>
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{/* Разбор выбранного адреса: пользователь должен видеть, ЧТО именно
			    он выбрал, а не только строку, которую сам набрал. */}
			{value.source === "dadata" && value.house && (
				<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--text-secondary)">
					<span className="inline-flex items-center gap-1 text-(--success)">
						<MapPin className="h-3.5 w-3.5" aria-hidden />
						Адрес определён
					</span>
					{value.postalCode && <span>индекс {value.postalCode}</span>}
				</p>
			)}

			{suggestionsEnabled && manualToggle}
		</div>
	);
}
