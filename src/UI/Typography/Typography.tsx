import { cn } from "@/utils/cn";
import type { HTMLAttributes, ElementType } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TextVariant =
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "body" | "body-sm" | "caption" | "label" | "code" | "overline";

type TextColor =
  | "primary" | "secondary" | "muted" | "inverse"
  | "accent" | "danger" | "success" | "warning" | "brand";

interface TypographyProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: TextVariant;
  color?: TextColor;
  truncate?: boolean;
  clamp?: 1 | 2 | 3;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const variantMap: Record<TextVariant, { tag: ElementType; className: string }> = {
  h1:       { tag: "h1", className: "text-4xl font-bold tracking-tight leading-tight text-[var(--text-primary)]" },
  h2:       { tag: "h2", className: "text-3xl font-bold tracking-tight leading-snug text-[var(--text-primary)]" },
  h3:       { tag: "h3", className: "text-2xl font-semibold leading-snug text-[var(--text-primary)]" },
  h4:       { tag: "h4", className: "text-xl font-semibold leading-snug text-[var(--text-primary)]" },
  h5:       { tag: "h5", className: "text-lg font-semibold leading-snug text-[var(--text-primary)]" },
  h6:       { tag: "h6", className: "text-base font-semibold leading-normal text-[var(--text-primary)]" },
  body:     { tag: "p",  className: "text-sm leading-relaxed text-[var(--text-primary)]" },
  "body-sm":{ tag: "p",  className: "text-xs leading-relaxed text-[var(--text-primary)]" },
  caption:  { tag: "span", className: "text-xs leading-none text-[var(--text-secondary)]" },
  label:    { tag: "span", className: "text-xs font-medium leading-none uppercase tracking-widest text-[var(--text-muted)]" },
  overline: { tag: "span", className: "text-xs font-semibold leading-none uppercase tracking-[0.12em] text-[var(--text-muted)]" },
  code:     { tag: "code",  className: "text-xs font-mono bg-[var(--surface-secondary)] px-1.5 py-0.5 rounded text-[var(--accent)]" },
};

const colorOverrides: Record<TextColor, string> = {
  primary:  "text-[var(--text-primary)]",
  secondary:"text-[var(--text-secondary)]",
  muted:    "text-[var(--text-muted)]",
  inverse:  "text-[var(--text-inverse)]",
  accent:   "text-[var(--accent)]",
  danger:   "text-[var(--error)]",
  success:  "text-[var(--success)]",
  warning:  "text-[var(--warning)]",
  brand:    "text-[var(--primary)]",
};

const clampStyles: Record<number, string> = {
  1: "overflow-hidden text-ellipsis whitespace-nowrap",
  2: "line-clamp-2",
  3: "line-clamp-3",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function Typography({
  as,
  variant = "body",
  color,
  truncate,
  clamp,
  className,
  children,
  ...props
}: TypographyProps) {
  const { tag: defaultTag, className: variantClass } = variantMap[variant];
  const Tag = as ?? defaultTag;

  return (
    <Tag
      className={cn(
        variantClass,
        color && colorOverrides[color],
        truncate && "overflow-hidden text-ellipsis whitespace-nowrap",
        clamp && clampStyles[clamp],
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

// Convenience aliases
export const Heading = (props: Omit<TypographyProps, "variant"> & { level?: 1|2|3|4|5|6 }) => {
  const { level = 1, ...rest } = props;
  return <Typography variant={`h${level}` as TextVariant} {...rest} />;
};

export const Text = (props: Omit<TypographyProps, "variant"> & { size?: "base" | "sm" }) => {
  const { size = "base", ...rest } = props;
  return <Typography variant={size === "sm" ? "body-sm" : "body"} {...rest} />;
};

export const Label = (props: Omit<TypographyProps, "variant">) => (
  <Typography variant="label" {...props} />
);

export const Caption = (props: Omit<TypographyProps, "variant">) => (
  <Typography variant="caption" {...props} />
);

export const Code = (props: Omit<TypographyProps, "variant">) => (
  <Typography variant="code" {...props} />
);

export default Typography;