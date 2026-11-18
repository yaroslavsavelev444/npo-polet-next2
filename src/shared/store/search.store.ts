import { create } from "zustand";

/**
 * Состояние поля поиска в шапке — только интерфейс.
 *
 * Сами результаты здесь не хранятся: их держит React Query (useSiteSearch) —
 * с кэшем по запросу, отменой устаревших запросов и повтором после ошибки.
 * Раньше стор вёл результаты, загрузку и ошибку вручную, и всё это
 * приходилось синхронизировать с AbortController самостоятельно.
 */
interface SearchState {
	query: string;
	isOpen: boolean;
	/** Ключ выделенного результата (`${type}-${id}`), а не индекс: индекс
	 *  съезжает, когда «Показать ещё» дописывает строки в середину списка. */
	activeKey: string | null;

	setQuery: (query: string) => void;
	setActiveKey: (key: string | null) => void;
	open: () => void;
	close: () => void;
	reset: () => void;
	restore: (snapshot: SearchSnapshot) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
	query: "",
	isOpen: false,
	activeKey: null,

	setQuery: (query) => set({ query, activeKey: null }),
	setActiveKey: (activeKey) => set({ activeKey }),

	open: () => set({ isOpen: true }),
	close: () => set({ isOpen: false }),

	reset: () => set({ query: "", isOpen: false, activeKey: null }),
	restore: ({ query, activeKey }) => set({ query, activeKey }),
}));

interface SearchSnapshot {
	query: string;
	activeKey: string;
	scrollTop: number;
}

const HISTORY_KEY = "poletSearch";
const snapshots = new Map<string, SearchSnapshot>();

export function rememberSearchResult(activeKey: string, scrollTop: number) {
	const { query, setActiveKey } = useSearchStore.getState();
	setActiveKey(activeKey);
	const id = window.history.state?.[HISTORY_KEY] ?? crypto.randomUUID();
	try {
		// В истории остаётся ключ записи, сам поисковый запрос — в памяти вкладки.
		window.history.replaceState(
			{ ...window.history.state, [HISTORY_KEY]: id },
			"",
		);
		snapshots.delete(id);
		snapshots.set(id, { query, activeKey, scrollTop });
		if (snapshots.size > 20) {
			const oldest = snapshots.keys().next().value;
			if (oldest !== undefined) snapshots.delete(oldest);
		}
	} catch {
		// Ограничения History API не должны блокировать переход к результату.
	}
}

export function searchSnapshotFromHistory(
	state: Record<string, unknown> | null,
) {
	const id = state?.[HISTORY_KEY];
	return typeof id === "string" ? snapshots.get(id) : undefined;
}
