"use client";

import {
	toast,
	useDebouncedCallback,
	useDocumentInfo,
	useForm,
	useLocale,
} from "@payloadcms/ui";
import { useCallback, useRef, useState } from "react";
import type { Product } from "@/payload-types";

const SPECIFICATIONS_PATH = "specifications";

type SpecRow = NonNullable<Product["specifications"]>[number];

type ProductOption = {
	id: number | string;
	title: string;
};

const buildRowState = (spec: SpecRow) => ({
	name: {
		value: spec.name,
		initialValue: spec.name,
		valid: true,
		passesCondition: true,
	},
	value: {
		value: spec.value,
		initialValue: spec.value,
		valid: true,
		passesCondition: true,
	},
	unit: {
		value: spec.unit ?? null,
		initialValue: spec.unit ?? null,
		valid: true,
		passesCondition: true,
	},
	group: {
		value: spec.group ?? null,
		initialValue: spec.group ?? null,
		valid: true,
		passesCondition: true,
	},
	isVisible: {
		value: spec.isVisible ?? true,
		initialValue: spec.isVisible ?? true,
		valid: true,
		passesCondition: true,
	},
});

export function CopySpecificationsField() {
	const { id: currentDocId } = useDocumentInfo();
	const { code: localeCode } = useLocale();
	const { addFieldRow, removeFieldRow, getDataByPath } = useForm();

	const [query, setQuery] = useState("");
	const [options, setOptions] = useState<ProductOption[]>([]);
	const [isOpen, setIsOpen] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [isCopying, setIsCopying] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const blurTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);

	const runSearch = useCallback(
		async (value: string) => {
			setIsSearching(true);
			try {
				const params = new URLSearchParams({
					depth: "0",
					locale: localeCode,
					limit: "8",
					draft: "true",
					"where[title][like]": value,
				});
				if (currentDocId != null) {
					params.set("where[id][not_equals]", String(currentDocId));
				}
				const res = await fetch(`/api/products?${params.toString()}`, {
					credentials: "include",
				});
				const data = await res.json();
				setOptions(
					Array.isArray(data?.docs)
						? data.docs.map((doc: { id: number | string; title: string }) => ({
								id: doc.id,
								title: doc.title,
							}))
						: [],
				);
			} catch {
				setOptions([]);
			} finally {
				setIsSearching(false);
			}
		},
		[currentDocId, localeCode],
	);

	const debouncedSearch = useDebouncedCallback(runSearch, 300);

	const handleQueryChange = (value: string) => {
		setQuery(value);
		setIsOpen(true);
		if (!value.trim()) {
			setOptions([]);
			return;
		}
		debouncedSearch(value);
	};

	const handleCopy = useCallback(
		async (product: ProductOption) => {
			setIsCopying(true);
			setIsOpen(false);
			setQuery("");
			setOptions([]);
			try {
				const params = new URLSearchParams({
					depth: "0",
					locale: localeCode,
					draft: "true",
				});
				const res = await fetch(
					`/api/products/${product.id}?${params.toString()}`,
					{ credentials: "include" },
				);
				if (!res.ok) {
					throw new Error("Не удалось загрузить товар");
				}
				const doc: Product = await res.json();
				const specs = doc.specifications ?? [];

				if (specs.length === 0) {
					toast.warning(`У товара «${product.title}» нет характеристик`);
					return;
				}

				const existingRows =
					(getDataByPath(SPECIFICATIONS_PATH) as unknown[] | undefined) ?? [];
				if (
					existingRows.length > 0 &&
					!window.confirm(
						`Заменить текущие характеристики (${existingRows.length}) характеристиками из товара «${product.title}» (${specs.length})? Их можно будет отредактировать после копирования.`,
					)
				) {
					return;
				}

				for (let i = existingRows.length - 1; i >= 0; i -= 1) {
					removeFieldRow({ path: SPECIFICATIONS_PATH, rowIndex: i });
				}

				specs.forEach((spec, index) => {
					addFieldRow({
						path: SPECIFICATIONS_PATH,
						schemaPath: SPECIFICATIONS_PATH,
						rowIndex: index,
						subFieldState: buildRowState(spec),
					});
				});

				toast.success(
					`Скопировано характеристик: ${specs.length} (из «${product.title}»)`,
				);
			} catch {
				toast.error("Не удалось скопировать характеристики");
			} finally {
				setIsCopying(false);
			}
		},
		[addFieldRow, removeFieldRow, getDataByPath, localeCode],
	);

	return (
		<div className="field-type ui" ref={containerRef}>
			<label className="field-label" htmlFor="copy-specifications-input">
				Скопировать характеристики с другого товара
			</label>
			<div style={{ position: "relative", maxWidth: 420 }}>
				<input
					id="copy-specifications-input"
					type="text"
					className="copy-specifications__input"
					style={{
						width: "100%",
						padding: "8px 12px",
						border: "1px solid var(--theme-elevation-150)",
						borderRadius: "4px",
						background: "var(--theme-input-bg)",
						color: "var(--theme-elevation-800)",
					}}
					placeholder="Начните вводить название товара…"
					value={query}
					disabled={isCopying}
					onChange={(event) => handleQueryChange(event.target.value)}
					onFocus={() => setIsOpen(true)}
					onBlur={() => {
						blurTimeout.current = setTimeout(() => setIsOpen(false), 150);
					}}
				/>
				{isOpen && query.trim().length > 0 && (
					<div
						style={{
							position: "absolute",
							top: "100%",
							left: 0,
							right: 0,
							zIndex: 10,
							marginTop: 4,
							background: "var(--theme-input-bg)",
							border: "1px solid var(--theme-elevation-150)",
							borderRadius: "4px",
							maxHeight: 220,
							overflowY: "auto",
							boxShadow: "var(--shadow-lg, 0 4px 12px rgba(0,0,0,0.15))",
						}}
					>
						{isSearching && (
							<div style={{ padding: "8px 12px", opacity: 0.7 }}>Поиск…</div>
						)}
						{!isSearching && options.length === 0 && (
							<div style={{ padding: "8px 12px", opacity: 0.7 }}>
								Ничего не найдено
							</div>
						)}
						{!isSearching &&
							options.map((option) => (
								<button
									type="button"
									key={option.id}
									onMouseDown={(event) => {
										// preventDefault, чтобы input.onBlur не закрыл список раньше клика
										event.preventDefault();
										clearTimeout(blurTimeout.current);
										handleCopy(option);
									}}
									style={{
										display: "block",
										width: "100%",
										textAlign: "left",
										padding: "8px 12px",
										background: "transparent",
										border: "none",
										cursor: "pointer",
									}}
								>
									{option.title}
								</button>
							))}
					</div>
				)}
			</div>
			{isCopying && (
				<div style={{ marginTop: 4, opacity: 0.7 }}>Копирование…</div>
			)}
		</div>
	);
}
