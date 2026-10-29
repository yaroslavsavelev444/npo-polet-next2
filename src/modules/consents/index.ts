// src/modules/consents/index.ts

export { ConsentDocument } from "./components/ConsentDocument";
export { ConsentHero } from "./components/ConsentHero";
export { ConsentRows } from "./components/ConsentRows";
export { ConsentToc } from "./components/ConsentToc";
export {
	type ConsentBlock,
	type ConsentSection,
	type ParsedConsent,
	parseConsent,
} from "./lib/parseConsent";
export {
	byAcceptanceThenTitle,
	type ConsentSummary,
	formatServiceDate,
	summarizeConsent,
} from "./lib/summary";
