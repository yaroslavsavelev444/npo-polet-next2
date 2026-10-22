"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { makeQueryClient } from "@/shared/lib/react-query/query-client";
export function QueryProvider({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(() => makeQueryClient());

	return (
		<QueryClientProvider client={queryClient}>
			{children}
			{process.env.NODE_ENV === "development" && (
				// Слева: правый нижний угол занят кнопкой чата поддержки.
				<ReactQueryDevtools
					initialIsOpen={false}
					buttonPosition="bottom-left"
				/>
			)}
		</QueryClientProvider>
	);
}
