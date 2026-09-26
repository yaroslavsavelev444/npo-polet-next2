import {
	Bot,
	Globe,
	type LucideIcon,
	MessageCircle,
	MessageSquare,
	Users,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { Setting } from "@/payload-types";
import {
	DzenIcon,
	MaxIcon,
	OkIcon,
	RutubeIcon,
	TelegramIcon,
	VkIcon,
} from "./social-icons";

/**
 * Иконки и фирменные оттенки каналов.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ГДЕ ЖИВЁТ ЦВЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Только в иконке и только при наведении (см. .net-link в contacts.css и
 * .social в Footer.module.css). Раскрашивать целиком плашку, как это было
 * раньше, нельзя: пять чужих фирменных цветов рядом друг с другом не
 * складываются ни во что и первыми разваливают палитру страницы. При этом
 * узнаваемость канала нужна — её и даёт подсветка иконки в момент, когда
 * посетитель до неё дотянулся.
 *
 * У соцсетей — фирменные знаки площадок (./social-icons): в подвале они
 * стоят плитками без подписи, и узнаются только по знаку. У «других
 * контактов» площадки нет, поэтому там нейтральные знаки lucide.
 */
export type SocialPlatform = NonNullable<
	Setting["socialLinks"]
>[number]["platform"];

export interface SocialConfigItem {
	/** Цвет CSS; где фирменный оттенок не читается на светлом фоне — пара
	 *  light-dark(светлая, тёмная), её разрешает браузер по теме страницы. */
	color: string;
	icon: LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;
}

export const socialConfig: Record<SocialPlatform, SocialConfigItem> = {
	telegram: { color: "light-dark(#1e8bc3, #2aabee)", icon: TelegramIcon },
	vk: { color: "#0077ff", icon: VkIcon },
	max: { color: "light-dark(#6d3fe0, #8b5cf6)", icon: MaxIcon },
	ok: { color: "light-dark(#c96a00, #ee8208)", icon: OkIcon },
	rutube: { color: "#ed143b", icon: RutubeIcon },
	dzen: { color: "light-dark(#12151b, #f2f2f2)", icon: DzenIcon },
};

/** То же для «других контактов» — мессенджеров, ботов, форумов, чатов. */
export const otherContactConfig: Record<string, SocialConfigItem> = {
	messenger: { color: "light-dark(#1e8bc3, #2aabee)", icon: MessageCircle },
	forum: { color: "light-dark(#5b6474, #8b94a3)", icon: Users },
	bot: { color: "light-dark(#0b7a37, #00c853)", icon: Bot },
	chat: { color: "light-dark(#0068c2, #008cff)", icon: MessageSquare },
	custom: { color: "light-dark(#5b6474, #8b94a3)", icon: Globe },
};
