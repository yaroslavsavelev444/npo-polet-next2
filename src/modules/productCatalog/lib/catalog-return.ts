export interface CatalogVisit {
	resultsHref: string;
	productId: string;
	pageCount: number;
	linkTop: number;
}

const HISTORY_KEY = "poletCatalogVisit";
let pendingVisit: CatalogVisit | null = null;

export function catalogProductLinkId(productId: string) {
	return `catalog-product-${productId}`;
}

function currentHref() {
	const { pathname, search, hash } = window.location;
	return pathname + search + hash;
}

function readHistoryVisit(): CatalogVisit | null {
	return window.history.state?.[HISTORY_KEY] ?? null;
}

function writeHistoryVisit(visit: CatalogVisit) {
	window.history.replaceState(
		{ ...window.history.state, [HISTORY_KEY]: visit },
		"",
	);
}

export function rememberCatalogVisit(productId: string, pageCount: number) {
	const link = document.getElementById(catalogProductLinkId(productId));
	if (!link) return;

	const visit = {
		resultsHref: currentHref(),
		productId,
		pageCount,
		linkTop: link.getBoundingClientRect().top,
	};
	// Снимок принадлежит записи выдачи в истории, включая её фильтры и сортировку.
	writeHistoryVisit(visit);
	pendingVisit = visit;
}

export function getCatalogReturnTarget() {
	const visit = readHistoryVisit();
	return visit?.resultsHref === currentHref() ? visit : null;
}

export function getCatalogOrigin(productId: string) {
	const visit = pendingVisit;
	pendingVisit = null;

	// Переносим снимок на запись товара после перехода по ссылке. Эта запись
	// также сохраняет ссылку на выдачу после перезагрузки и перехода вперёд.
	if (visit?.productId === productId && !getCatalogReturnTarget()) {
		writeHistoryVisit(visit);
	}

	const stored = readHistoryVisit();
	return stored?.productId === productId ? stored : null;
}
