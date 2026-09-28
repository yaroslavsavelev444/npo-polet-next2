"use client";

import { AlertCircle, Building2, Loader2, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useSuggestions } from "../hooks/useSuggestions";
import {
	COMPANY_QUERY_MIN_DIGITS,
	COMPANY_QUERY_MIN_TEXT,
	isCompanyQuerySearchable,
	isDigitsQuery,
	normalizeCompanyQuery,
} from "../lib/company-query";
import type { CompanyRegistryStatus, CompanySuggestion } from "../types";
import styles from "./Checkout.module.css";
import { TextField } from "./fields";

/**
 * Поиск организации по ИНН, ОГРН или названию — паттерн ARIA 1.2 combobox,
 * как у AddressAutocomplete.
 *
 * В отличие от адреса, поле поиска НЕ хранит данные формы: оно только
 * подбирает реквизиты и отдаёт их наверх через onSelect. Сами реквизиты живут
 * в обычных полях под ним, видны всегда и всегда редактируются. Поэтому:
 *  • отдельного «ручного режима» нет — ручной ввод доступен без
 *    переключений, а недоступность DaData просто убирает ускорение;
 *  • текст, набранный в поиске и не подтверждённый выбором, в заказ не
 *    попадает никогда.
 */

interface Props {
	onSelect: (suggestion: CompanySuggestion) => void;
	inputId: string;
}

/** Названия набирают медленнее адресов — пауза чуть длиннее. */
const DEBOUNCE_MS = 300;

const DEGRADED_MESSAGES: Record<string, string> = {
	not_configured:
		"Поиск организаций сейчас недоступен — заполните реквизиты вручную",
	unavailable:
		"Не удалось найти организацию. Попробуйте ещё раз или заполните реквизиты вручную",
	rate_limited:
		"Слишком много запросов. Подождите немного или заполните реквизиты вручную",
};

export const COMPANY_STATUS_LABELS: Record<
	Exclude<CompanyRegistryStatus, "ACTIVE">,
	string
> = {
	LIQUIDATING: "Ликвидируется",
	LIQUIDATED: "Ликвидирована",
	BANKRUPT: "Банкротство",
	REORGANIZING: "Реорганизуется",
	UNKNOWN: "Статус не определён",
};

export function CompanyAutocomplete({ onSelect, inputId }: Props) {
	const [query, setQuery] = useState("");
	const [isOpen, setIsOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);

	const listboxId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	// Выбор мышью происходит раньше blur — флаг не даёт закрыть список до того,
	// как отработает клик по подсказке.
	const isSelectingRef = useRef(false);

	const normalized = normalizeCompanyQuery(query);
	const searchable = isCompanyQuerySearchable(normalized);

	const { suggestions, status, degradedReason, isEmpty, retry } =
		useSuggestions<CompanySuggestion>({
			endpoint: "/api/company/suggest",
			query: normalized,
			searchable,
			enabled: isOpen,
			debounceMs: DEBOUNCE_MS,
		});

	const activeOptionId =
		activeIndex >= 0 && suggestions[activeIndex]
			? `${listboxId}-option-${activeIndex}`
			: undefined;

	const showList =
		isOpen &&
		(status === "loading" ||
			suggestions.length > 0 ||
			isEmpty ||
			status === "degraded");

	function select(suggestion: CompanySuggestion) {
		onSelect(suggestion);
		// В поле остаётся то, что выбрано, — пользователь видит, какую
		// организацию подставил, а не свой промежуточный запрос.
		setQuery(suggestion.label);
		setIsOpen(false);
		setActiveIndex(-1);
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
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
				select(suggestions[activeIndex]);
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

	let helperText = "Выберите организацию — реквизиты заполнятся автоматически";
	if (normalized && !searchable) {
		helperText = isDigitsQuery(normalized)
			? `Введите ИНН полностью — ${COMPANY_QUERY_MIN_DIGITS} или 12 цифр`
			: `Введите не менее ${COMPANY_QUERY_MIN_TEXT} символов`;
	}

	return (
		<div className={styles.suggestWrap}>
			<TextField
				id={inputId}
				inputRef={inputRef}
				label="Найти организацию"
				optionalNote="необязательно"
				placeholder="ИНН или название"
				value={query}
				autoComplete="off"
				autoCorrect="off"
				spellCheck={false}
				leftIcon={<Search size={16} aria-hidden />}
				rightSlot={
					status === "loading" ? (
						<span className={styles.fieldIcon} aria-hidden>
							<Loader2 size={16} className={styles.spin} />
						</span>
					) : query ? (
						<button
							type="button"
							aria-label="Очистить поиск организации"
							className={styles.fieldButton}
							// Очистка не должна проходить через blur поля: иначе
							// список успевает закрыться, и кнопка «не срабатывает».
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => {
								// Очищается только поиск: уже подставленные реквизиты
								// принадлежат форме и стираются только руками.
								setQuery("");
								inputRef.current?.focus();
								setIsOpen(true);
							}}
						>
							<X size={16} aria-hidden />
						</button>
					) : null
				}
				hint={helperText}
				role="combobox"
				aria-expanded={showList}
				aria-controls={showList ? listboxId : undefined}
				aria-autocomplete="list"
				aria-activedescendant={activeOptionId}
				onChange={(e) => {
					setQuery(e.target.value);
					setIsOpen(true);
					setActiveIndex(-1);
				}}
				onKeyDown={handleKeyDown}
				onFocus={() => setIsOpen(true)}
				onBlur={() => {
					if (isSelectingRef.current) return;
					setIsOpen(false);
					setActiveIndex(-1);
				}}
			/>

			{showList && (
				<div
					className={styles.suggestPanel}
					onMouseDown={() => {
						isSelectingRef.current = true;
					}}
					onMouseUp={() => {
						isSelectingRef.current = false;
					}}
				>
					{status === "loading" && suggestions.length === 0 && (
						<p className={styles.suggestState}>
							<span className={styles.suggestStateRow}>
								<Loader2 size={15} className={styles.spin} aria-hidden />
								Ищем организацию…
							</span>
						</p>
					)}

					{suggestions.length > 0 && (
						<ul
							ref={listRef}
							id={listboxId}
							role="listbox"
							aria-label="Найденные организации"
							className={styles.suggestList}
						>
							{suggestions.map((suggestion, index) => {
								const isActive = index === activeIndex;
								const { requisites } = suggestion;
								// ИНН, КПП и город вместе однозначно различают тёзок и
								// филиалы одной организации (у них ИНН общий).
								const details = [
									`ИНН ${suggestion.inn}`,
									requisites.kpp && `КПП ${requisites.kpp}`,
									suggestion.city,
								]
									.filter(Boolean)
									.join(" · ");
								return (
									<li
										key={suggestion.id}
										id={`${listboxId}-option-${index}`}
										role="option"
										aria-selected={isActive}
										onMouseEnter={() => setActiveIndex(index)}
										onClick={() => select(suggestion)}
										className={styles.suggestOption}
									>
										<Building2
											size={15}
											aria-hidden
											className={styles.suggestOptionIcon}
										/>
										<span className={styles.suggestOptionBody}>
											<span className={styles.suggestLabel}>
												{suggestion.label}
											</span>
											<span className={styles.suggestHint}>{details}</span>
											{suggestion.isBranch && (
												<span className={styles.suggestMuted}>Филиал</span>
											)}
											{suggestion.status !== "ACTIVE" && (
												<span className={styles.suggestWarn}>
													{COMPANY_STATUS_LABELS[suggestion.status]}
												</span>
											)}
										</span>
									</li>
								);
							})}
						</ul>
					)}

					{isEmpty && (
						<div className={styles.suggestState}>
							<span>
								Ничего не нашлось по запросу «{normalized}». Заполните реквизиты
								вручную ниже.
							</span>
						</div>
					)}

					{status === "degraded" && degradedReason && (
						<div className={styles.suggestState}>
							<span
								className={styles.suggestStateRow}
								style={{ color: "var(--warning)" }}
							>
								<AlertCircle size={15} aria-hidden />
								{DEGRADED_MESSAGES[degradedReason] ??
									DEGRADED_MESSAGES.unavailable}
							</span>
							{degradedReason !== "not_configured" && (
								<span className={styles.suggestActions}>
									<button
										type="button"
										onClick={retry}
										className={styles.linkButton}
									>
										Попробовать снова
									</button>
								</span>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
