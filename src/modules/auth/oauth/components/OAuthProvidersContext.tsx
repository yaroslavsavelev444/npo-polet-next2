"use client";

import { createContext, useContext } from "react";

/**
 * Какие внешние сервисы входа включены. Решает сервер (src/env.ts →
 * oauth/config.ts) один раз в корневом layout витрины, а читают формы входа —
 * и на страницах, и в оверлее поверх корзины, — не протаскивая флаг через
 * шапку, хост оверлея и сам оверлей.
 */
interface OAuthProviders {
	yandex: boolean;
}

const OAuthProvidersContext = createContext<OAuthProviders>({ yandex: false });

export function OAuthProvidersProvider({
	yandex,
	children,
}: OAuthProviders & { children: React.ReactNode }) {
	return (
		<OAuthProvidersContext.Provider value={{ yandex }}>
			{children}
		</OAuthProvidersContext.Provider>
	);
}

export function useOAuthProviders(): OAuthProviders {
	return useContext(OAuthProvidersContext);
}
