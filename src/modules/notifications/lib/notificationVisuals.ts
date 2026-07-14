import {
  Gift,
  Info,
  MessageCircle,
  Package,
  Percent,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Star,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "../types";

type Accent = "accent" | "warning" | "success" | "primary" | "muted";

const VISUALS: Record<NotificationType, { icon: LucideIcon; accent: Accent }> = {
  system: { icon: Info, accent: "muted" },
  subscription_match: { icon: Sparkles, accent: "primary" },
  chat: { icon: MessageCircle, accent: "accent" },
  review: { icon: Star, accent: "primary" },
  order: { icon: Package, accent: "accent" },
  promotion: { icon: Gift, accent: "success" },
  discount: { icon: Percent, accent: "success" },
  product: { icon: ShoppingBag, accent: "accent" },
  login_from_new_device: { icon: ShieldAlert, accent: "warning" },
  security: { icon: ShieldAlert, accent: "warning" },
  account: { icon: UserCog, accent: "warning" },
};

const ACCENT_CLASSES: Record<Accent, string> = {
  accent: "bg-[var(--accent)]/15 text-[var(--accent)]",
  warning: "bg-[var(--warning)]/15 text-[var(--warning)]",
  success: "bg-[var(--success)]/15 text-[var(--success)]",
  primary: "bg-[var(--primary)]/15 text-[var(--primary)]",
  muted: "bg-[var(--surface-secondary)] text-[var(--text-muted)]",
};

export function getNotificationVisual(type: NotificationType) {
  const { icon, accent } = VISUALS[type] ?? VISUALS.system;
  return { Icon: icon, className: ACCENT_CLASSES[accent] };
}
