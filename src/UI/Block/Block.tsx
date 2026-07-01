import { cn } from "@/utils/cn";
import type { HTMLAttributes, ReactNode } from "react";

export type BlockVariant = "default" | "elevated" | "outlined" | "ghost";
export type BlockSize = "sm" | "md" | "lg" | "xl";
export type BlockAlign = "left" | "center" | "right";

export interface BlockSection {
  title?: string;
  subtitle?: string;
  content?: ReactNode;
}

export interface BlockProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  description?: string;
  header?: ReactNode;
  footer?: ReactNode;
  sections?: BlockSection[];
  variant?: BlockVariant;
  size?: BlockSize;
  align?: BlockAlign;
  noPadding?: boolean;
  divider?: boolean;
  clickable?: boolean;
}

const variantStyles: Record<BlockVariant, string> = {
  default:  "bg-[var(--surface)] border border-[var(--border)]",
  elevated: "bg-[var(--surface)] border border-[var(--border)] shadow-[0_4px_24px_var(--shadow-color)]",
  outlined: "bg-transparent border border-[var(--border-light)]",
  ghost:    "bg-transparent border-transparent",
};

const sizeStyles: Record<BlockSize, { padding: string; gap: string; radius: string; titleClass: string }> = {
  sm: { padding: "p-3",  gap: "gap-2", radius: "rounded-[var(--radius-sm)]", titleClass: "text-sm font-semibold" },
  md: { padding: "p-5",  gap: "gap-3", radius: "rounded-[var(--radius-md)]", titleClass: "text-base font-semibold" },
  lg: { padding: "p-7",  gap: "gap-4", radius: "rounded-[var(--radius-lg)]", titleClass: "text-lg font-semibold" },
  xl: { padding: "p-9",  gap: "gap-5", radius: "rounded-[var(--radius-xl)]", titleClass: "text-2xl font-bold" },
};

const alignStyles: Record<BlockAlign, string> = {
  left:   "text-left items-start",
  center: "text-center items-center",
  right:  "text-right items-end",
};

export function Block({
  title,
  subtitle,
  description,
  header,
  footer,
  sections = [],
  variant = "default",
  size = "md",
  align = "left",
  noPadding = false,
  divider = false,
  clickable = false,
  className,
  children,
  onClick,
  ...props
}: BlockProps) {
  const s = sizeStyles[size];
  const hasHeader = !!(title || subtitle || description || header);
  const hasContent = !!(children || sections.length > 0);

  return (
    <div
      className={cn(
        "flex flex-col",
        variantStyles[variant],
        s.radius,
        !noPadding && s.padding,
        !noPadding && s.gap,
        clickable && "cursor-pointer transition-all duration-200 hover:border-[var(--border-light)] hover:-translate-y-0.5",
        className,
      )}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") onClick?.(e as any); } : undefined}
      {...props}
    >
      {/* Header */}
      {hasHeader && (
        <div className={cn("flex flex-col gap-1", alignStyles[align])}>
          {header ?? (
            <>
              {title && (
                <p className={cn(s.titleClass, "text-[var(--text-primary)] m-0")}>{title}</p>
              )}
              {subtitle && (
                <p className="text-sm font-medium text-[var(--text-secondary)] m-0">{subtitle}</p>
              )}
              {description && (
                <p className="text-sm text-[var(--text-muted)] m-0 leading-relaxed">{description}</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Divider между header и content */}
      {divider && hasHeader && hasContent && (
        <hr className="border-[var(--border)] m-0" />
      )}

      {/* Content */}
      {hasContent && (
        <div className={cn("flex flex-col", s.gap)}>
          {children}

          {/* Sections */}
          {sections.length > 0 && (
            <div className="flex flex-col gap-3">
              {sections.map((section, idx) => (
                <div
                  key={section.title ? `${section.title}-${idx}` : idx}
                  className="flex flex-col gap-1.5 p-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-secondary)]"
                >
                  {(section.title || section.subtitle) && (
                    <div className="flex flex-col gap-0.5">
                      {section.title && (
                        <p className="text-sm font-semibold text-[var(--text-primary)] m-0">{section.title}</p>
                      )}
                      {section.subtitle && (
                        <p className="text-xs text-[var(--text-muted)] m-0">{section.subtitle}</p>
                      )}
                    </div>
                  )}
                  {section.content}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Divider перед footer */}
      {divider && footer && (
        <hr className="border-[var(--border)] m-0" />
      )}

      {/* Footer */}
      {footer && (
        <div className="mt-auto">{footer}</div>
      )}
    </div>
  );
}

export default Block;