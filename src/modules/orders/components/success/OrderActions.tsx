import { ArrowLeft, PackageSearch } from "lucide-react";
import Link from "next/link";
import { buttonStyles } from "@/UI/Button/Button.styles";

/**
 * Основные действия после оформления: перейти к своим заказам или вернуться в
 * каталог. Ссылки стилизованы как кнопки (buttonStyles), т.к. семантически это
 * переходы, а не действия-кнопки. На мобильных — в столбец на всю ширину.
 */
export function OrderActions() {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
			<Link
				href="/orders"
				className={buttonStyles("primary", "lg", false, "sm:min-w-52")}
			>
				<PackageSearch size={18} aria-hidden />К заказам
			</Link>
			<Link
				href="/category"
				className={buttonStyles("outline", "lg", false, "sm:min-w-52")}
			>
				<ArrowLeft size={18} aria-hidden />
				Назад к покупкам
			</Link>
		</div>
	);
}
