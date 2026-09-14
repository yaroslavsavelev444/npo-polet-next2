// Публичный вход в модуль баннеров.
//
// ⚠ Барель НЕ ГОДИТСЯ для графа payload.config.ts: он тянет за собой React, а
// граф конфигурации грузится нативным резолвером Node (см.
// scripts/verify-payload-graph.mjs). Коллекции импортируют конкретные файлы —
// `conditions.ts` и `vocabulary.ts` — и обязаны продолжать так делать.

export { BannerGate } from "./components/BannerGate";

export type {
	BannerAudienceFacts,
	BannerCondition,
	BannerConditionMatch,
	BannerTrackedAction,
} from "./conditions";
export type { BannerPolicy } from "./policy";
export type {
	BannerActionView,
	BannerEventAck,
	BannerImageView,
	BannerView,
	NextBannerResponse,
} from "./types";
export type {
	BannerCloseMethod,
	BannerEventKind,
	BannerImageMode,
	BannerImportance,
	BannerLifecycleStatus,
	BannerLinkKind,
	BannerOutcomeKind,
	BannerPolicyKind,
	BannerStateStatus,
} from "./vocabulary";
