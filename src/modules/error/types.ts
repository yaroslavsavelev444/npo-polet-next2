import type { ReactNode } from "react";

export type ErrorPageProps = {
	code: string; // "500" | "503" и т.д. (404 — см. NotFoundView)
	title: string;
	description: ReactNode;
	retry?: () => void; // callback для повторной попытки
	showBackButton?: boolean; // показывать кнопку "Назад"
};
