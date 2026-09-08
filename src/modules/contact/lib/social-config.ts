import {
	Bot,
	Code2,
	Globe,
	type LucideIcon,
	MessageCircle,
	MessageSquare,
	Send,
	Users,
} from "lucide-react";

/**
 * Иконки и фирменные оттенки каналов.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ГДЕ ЖИВЁТ ЦВЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Только в иконке и только при наведении (см. .net-link в contacts.css).
 * Раскрашивать целиком плашку, как это было раньше, нельзя: пять чужих
 * фирменных цветов рядом друг с другом не складываются ни во что и первыми
 * разваливают палитру страницы. При этом узнаваемость канала нужна — её и
 * даёт подсветка иконки в момент, когда посетитель до неё дотянулся.
 *
 * Иконки взяты из одного набора (lucide) с одинаковой толщиной штриха.
 * Фирменных знаков площадок в нём больше нет (бренд-иконки вынесены из набора
 * начиная с 1.x), поэтому у всех каналов стоят нейтральные знаки из того же
 * семейства. Дорисовать один-два логотипа вручную было бы хуже: чужеродная
 * иконка в другом стиле заметнее, чем её отсутствие.
 */
export interface SocialConfigItem {
	color: string;
	icon: LucideIcon;
}

export const socialConfig: Record<string, SocialConfigItem> = {
	telegram: { color: "#2AABEE", icon: Send },
	whatsapp: { color: "#25D366", icon: MessageCircle },
	vk: { color: "#0077FF", icon: MessageSquare },
	github: { color: "#E6E6E6", icon: Code2 },
	max: { color: "#7C5CFF", icon: Globe },
	other: { color: "#8B94A3", icon: Globe },
};

/** То же для «других контактов» — мессенджеров, ботов, форумов, чатов. */
export const otherContactConfig: Record<string, SocialConfigItem> = {
	messenger: { color: "#2AABEE", icon: MessageCircle },
	forum: { color: "#8B94A3", icon: Users },
	bot: { color: "#00C853", icon: Bot },
	chat: { color: "#008CFF", icon: MessageSquare },
	custom: { color: "#8B94A3", icon: Globe },
};
