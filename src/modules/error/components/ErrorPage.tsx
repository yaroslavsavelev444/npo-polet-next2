"use client";

import { Home, RotateCw } from "lucide-react";
import Link from "next/link";
import { buttonStyles } from "@/UI/Button/Button.styles";
import type { ErrorPageProps } from "./../types";
import { BackButton } from "./BackButton";
import { ErrorView } from "./ErrorView";

/**
 * Страница непредвиденной ошибки (error.tsx). Делит оболочку с 404, чтобы обе
 * читались как один продукт: разница только в акцентном цвете кода и в наборе
 * действий — здесь главное действие «Повторить», а не «На главную».
 */
export function ErrorPage({
	code,
	title,
	description,
	retry,
	showBackButton = true,
}: ErrorPageProps) {
	return (
		<ErrorView
			code={code}
			title={title}
			description={description}
			accent="error"
			actions={
				<>
					{retry && (
						<button
							type="button"
							onClick={retry}
							className={buttonStyles(
								"primary",
								"md",
								false,
								"active:scale-[0.98] transition-[background-color,transform] duration-150",
							)}
						>
							<RotateCw size={16} aria-hidden />
							Повторить
						</button>
					)}

					<Link
						href="/"
						className={buttonStyles(retry ? "outline" : "primary", "md", false)}
					>
						<Home size={16} aria-hidden />
						На главную
					</Link>

					{showBackButton && <BackButton />}
				</>
			}
		/>
	);
}

export default ErrorPage;
