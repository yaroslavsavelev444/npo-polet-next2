"use client";

import { type ReactNode, useId, useState } from "react";
import { cn } from "@/utils/cn";

export interface TabItem {
	key: string;
	label: ReactNode;
	content: ReactNode;
	disabled?: boolean;
}

export interface TabsProps {
	items: TabItem[];
	defaultActiveKey?: string;
	/** Управляемый режим: если задан, активная вкладка контролируется извне. */
	activeKey?: string;
	onChange?: (key: string) => void;
	className?: string;
	tabListClassName?: string;
	panelClassName?: string;
}

export function Tabs({
	items,
	defaultActiveKey,
	activeKey: controlledActiveKey,
	onChange,
	className,
	tabListClassName,
	panelClassName,
}: TabsProps) {
	const baseId = useId();
	const [internalActiveKey, setInternalActiveKey] = useState(
		defaultActiveKey ?? items[0]?.key,
	);
	const isControlled = controlledActiveKey !== undefined;
	const activeKey = isControlled ? controlledActiveKey : internalActiveKey;

	const selectTab = (key: string) => {
		if (!isControlled) setInternalActiveKey(key);
		onChange?.(key);
	};

	const activeItem = items.find((item) => item.key === activeKey) ?? items[0];

	if (!activeItem) return null;

	return (
		<div className={cn("flex flex-col", className)}>
			<div
				role="tablist"
				className={cn(
					"flex gap-1 overflow-x-auto border-b border-[var(--border)]",
					tabListClassName,
				)}
			>
				{items.map((item) => {
					const isActive = item.key === activeItem.key;
					return (
						<button
							key={item.key}
							type="button"
							role="tab"
							id={`${baseId}-tab-${item.key}`}
							aria-selected={isActive}
							aria-controls={`${baseId}-panel-${item.key}`}
							disabled={item.disabled}
							onClick={() => selectTab(item.key)}
							className={cn(
								"shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium",
								"border-b-2 -mb-px transition-colors duration-150",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2",
								isActive
									? "border-[var(--primary)] text-[var(--primary)]"
									: "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-light)]",
								item.disabled && "cursor-not-allowed opacity-40",
							)}
						>
							{item.label}
						</button>
					);
				})}
			</div>

			<div
				role="tabpanel"
				id={`${baseId}-panel-${activeItem.key}`}
				aria-labelledby={`${baseId}-tab-${activeItem.key}`}
				className={cn("pt-6", panelClassName)}
			>
				{activeItem.content}
			</div>
		</div>
	);
}

export default Tabs;
