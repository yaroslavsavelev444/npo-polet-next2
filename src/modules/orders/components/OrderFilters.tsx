"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/utils/cn";
import { ORDER_FILTER_GROUPS } from "../lib/status.groups";
import type { OrderFilterGroup } from "../types";

interface Props {
	active: OrderFilterGroup;
}

export function OrderFilters({ active }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	function handleSelect(group: OrderFilterGroup) {
		const params = new URLSearchParams(searchParams.toString());
		if (group === "all") {
			params.delete("status");
		} else {
			params.set("status", group);
		}
		params.delete("page");

		const query = params.toString();
		startTransition(() => {
			router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
		});
	}

	return (
		<div
			role="tablist"
			aria-label="Фильтр заказов по статусу"
			className={cn(
				"mb-6 flex flex-wrap gap-1 border-b border-[var(--border)]",
				isPending && "opacity-70",
			)}
		>
			{ORDER_FILTER_GROUPS.map((group) => {
				const isActive = group.key === active;
				return (
					<button
						key={group.key}
						type="button"
						role="tab"
						aria-selected={isActive}
						onClick={() => handleSelect(group.key)}
						className={cn(
							"shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium",
							"-mb-px border-b-2 transition-colors duration-150",
							isActive
								? "border-[var(--primary)] text-[var(--primary)]"
								: "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-light)] hover:text-[var(--text-primary)]",
						)}
					>
						{group.label}
					</button>
				);
			})}
		</div>
	);
}
