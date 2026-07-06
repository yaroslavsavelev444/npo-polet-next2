import { AlertTriangle, Ban, Construction } from "lucide-react";
import { cn } from "@/utils/cn";
import type { PagePlaceholderProps } from "../types";
import { PlaceholderActions } from "./PlaceholderActions";

const variantDefaults: Record<
  NonNullable<PagePlaceholderProps["variant"]>,
  { icon: React.ReactNode; defaultDescription: string }
> = {
  development: {
    icon: <Construction className="h-16 w-16 text-amber-500" />,
    defaultDescription:
      "Раздел находится в разработке. Мы уже работаем над ним.",
  },
  maintenance: {
    icon: <AlertTriangle className="h-16 w-16 text-orange-500" />,
    defaultDescription:
      "Ведутся технические работы. Пожалуйста, зайдите позже.",
  },
  disabled: {
    icon: <Ban className="h-16 w-16 text-red-500" />,
    defaultDescription: "Раздел временно недоступен.",
  },
};

export function PagePlaceholder({
  title,
  description,
  icon,
  action,
  variant = "development",
  fullHeight = true,
}: PagePlaceholderProps) {
  const defaults = variantDefaults[variant];
  const displayIcon = icon ?? defaults.icon;
  const displayDescription = description ?? defaults.defaultDescription;

  return (
    <section
      className={cn(
        "flex flex-col items-center justify-center px-4 text-center",
        fullHeight ? "min-h-[60vh]" : "py-16",
      )}
    >
      <div className="mb-6">{displayIcon}</div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        {title}
      </h1>
      <p className="mt-3 max-w-md text-base text-gray-600 dark:text-gray-400">
        {displayDescription}
      </p>
      {action && <PlaceholderActions action={action} />}
    </section>
  );
}
