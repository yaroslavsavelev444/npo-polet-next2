import { cn } from "@/utils/cn";
import type { CardProps } from "./Card.types";

const variantStyles = {
  default:
    "bg-[var(--surface)] border border-[var(--border)]",
  elevated:
    "bg-[var(--surface)] border border-[var(--border)] shadow-[0_4px_24px_var(--shadow-color)]",
  outlined:
    "bg-transparent border border-[var(--border-light)]",
  ghost:
    "bg-transparent border-none shadow-none",
};

const sizeStyles = {
  sm: "p-3 rounded-[var(--radius-sm)]",
  md: "p-5 rounded-[var(--radius-md)]",
  lg: "p-7 rounded-[var(--radius-lg)]",
};

export function Card({
  variant = "default",
  size = "md",
  header,
  footer,
  clickable = false,
  noPadding = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        variantStyles[variant],
        !noPadding && sizeStyles[size],
        noPadding && "rounded-[var(--radius-md)] overflow-hidden",
        clickable &&
          "cursor-pointer transition-all duration-200 hover:border-[var(--border-light)] hover:shadow-[0_8px_32px_var(--shadow-color)] hover:-translate-y-0.5",
        className,
      )}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      {...props}
    >
      {header && (
        <div
          className={cn(
            "border-b border-[var(--border)] mb-4",
            noPadding && "px-5 pt-5 pb-4",
          )}
        >
          {header}
        </div>
      )}

      <div className={noPadding ? "px-5 py-4" : undefined}>{children}</div>

      {footer && (
        <div
          className={cn(
            "border-t border-[var(--border)] mt-4 pt-4",
            noPadding && "px-5 pb-5",
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

export default Card;