"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCatalogOrigin } from "../lib/catalog-return";

export function ReturnToCatalogLink({ productId }: { productId: string }) {
	const router = useRouter();
	const [resultsHref, setResultsHref] = useState<string | null>(null);

	useEffect(() => {
		setResultsHref(getCatalogOrigin(productId)?.resultsHref ?? null);
	}, [productId]);

	if (!resultsHref) return null;

	return (
		<Link
			href={resultsHref}
			onNavigate={(event) => {
				event.preventDefault();
				router.back();
			}}
			className="mt-3 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-[var(--accent-light)] hover:underline focus-visible:underline"
		>
			<ArrowLeft size={16} aria-hidden />
			Вернуться к результатам
		</Link>
	);
}
