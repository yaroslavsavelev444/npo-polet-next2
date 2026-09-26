"use client";

import { useSyncExternalStore } from "react";
import type { SchemePreference } from "../lib/scheme";
import { readSchemePreference, subscribeToScheme } from "../lib/scheme.client";

/**
 * Текущий выбор темы. Во время серверного рендера и гидратации — значение,
 * которое пришло с сервера (из cookie), дальше — атрибут на <html>.
 */
export function useSchemePreference(
	serverPreference: SchemePreference = "auto",
): SchemePreference {
	return useSyncExternalStore(
		subscribeToScheme,
		readSchemePreference,
		() => serverPreference,
	);
}
