import Link from "next/link";
import { cn } from "@/utils/cn";
import type { PlaceholderAction } from "../types";

interface PlaceholderActionsProps {
  action: PlaceholderAction;
}

export function PlaceholderActions({ action }: PlaceholderActionsProps) {
  return (
    <div className="mt-8 flex justify-center">
      <Link
        href={action.href}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold",
          "text-white shadow-sm transition-colors hover:bg-primary-700",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600",
        )}
      >
        {action.label}
      </Link>
    </div>
  );
}
