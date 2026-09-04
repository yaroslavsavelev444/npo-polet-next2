import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface PageContainerProps {
	children: ReactNode;
	className?: string;
}

/**
 * Единственная мера ширины контента страницы.
 *
 * Раньше страницы обходились классом `container mx-auto`, а сам <main> ширины
 * не имел: в корневом layout он лежит внутри центрирующего flex-ряда и потому
 * подбирал ширину под содержимое. Пока внутри были обычные блоки, это сходило
 * с рук; стоило появиться потомку с `container-type: inline-size` (сетка
 * карточек), как его вклад в intrinsic-размер обнулился и <main> схлопнулся до
 * ширины заголовка. Отсюда же росла и претензия «у разных товаров разные
 * отступы»: ширина страницы зависела от контента.
 *
 * Здесь ширина задана явно и не зависит ни от чего внутри. Все секции одной
 * страницы, обёрнутые в PageContainer, выходят на общие левую и правую
 * границы — это и есть тот «общий край», по которому глаз читает страницу как
 * целое.
 */
export function PageContainer({ children, className }: PageContainerProps) {
	return (
		<div
			className={cn(
				"mx-auto w-full max-w-[1280px] px-[1rem] sm:px-6",
				className,
			)}
		>
			{children}
		</div>
	);
}

export default PageContainer;
