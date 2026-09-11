import { ArrowLeft, PackageSearch } from "lucide-react";
import Link from "next/link";
import styles from "../Orders.module.css";

/**
 * Куда идти дальше после оформления: к своим заказам или обратно в каталог.
 *
 * Ссылки, а не кнопки: семантически это переходы. Вид у них общий с кнопками
 * страницы заказов — тот же рост, то же скругление, те же два тона.
 */
export function OrderActions() {
	return (
		<div className={`${styles.actions} justify-center`}>
			<Link href="/orders" className={`${styles.btn} ${styles.btnPrimary}`}>
				<PackageSearch size={16} aria-hidden />К заказам
			</Link>
			<Link href="/category" className={`${styles.btn} ${styles.btnQuiet}`}>
				<ArrowLeft size={16} aria-hidden />
				Назад к покупкам
			</Link>
		</div>
	);
}
