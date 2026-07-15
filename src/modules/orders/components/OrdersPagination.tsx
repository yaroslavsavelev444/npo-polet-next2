"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/UI";

interface Props {
	page: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export function OrdersPagination({
	page,
	totalPages,
	hasNextPage,
	hasPrevPage,
}: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	if (totalPages <= 1) return null;

	function goToPage(nextPage: number) {
		const params = new URLSearchParams(searchParams.toString());
		if (nextPage <= 1) {
			params.delete("page");
		} else {
			params.set("page", String(nextPage));
		}
		const query = params.toString();
		router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
	}

	return (
		<div className="mt-6 flex items-center justify-center gap-3">
			<Button
				variant="outline"
				size="sm"
				disabled={!hasPrevPage}
				onClick={() => goToPage(page - 1)}
				leftIcon={<ChevronLeft className="h-4 w-4" />}
			>
				Назад
			</Button>
			<span className="text-sm text-[var(--text-secondary)]">
				Страница {page} из {totalPages}
			</span>
			<Button
				variant="outline"
				size="sm"
				disabled={!hasNextPage}
				onClick={() => goToPage(page + 1)}
				rightIcon={<ChevronRight className="h-4 w-4" />}
			>
				Вперёд
			</Button>
		</div>
	);
}
