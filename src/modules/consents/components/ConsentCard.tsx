// src/components/consents/ConsentCard.tsx

import { ArrowUpRight, FileText } from "lucide-react";
import Link from "next/link";
import type { Consent } from "@/payload-types";

interface ConsentCardProps {
  consent: Consent;
}

export function ConsentCard({ consent }: ConsentCardProps) {
  return (
    <Link
      href={`/consents/${consent.slug}`}
      aria-label={`Открыть соглашение: ${consent.title}`}
      className="group flex items-start gap-4 rounded-[var(--radius-lg)] border border-[var(--border)]
        bg-[var(--background)] p-5 transition-all duration-200
        hover:-translate-y-0.5 hover:border-[var(--primary-200)] hover:shadow-[0_8px_24px_var(--shadow-color)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--primary)]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-light)]">
        <FileText size={20} strokeWidth={2} color="var(--primary)" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-[1rem] font-bold leading-snug text-[var(--text-primary)]">
          {consent.title}
        </h3>
        {consent.excerpt && (
          <p
            className="text-sm leading-relaxed text-[var(--text-secondary)]"
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            }}
          >
            {consent.excerpt}
          </p>
        )}
      </div>

      <ArrowUpRight
        size={18}
        className="mt-1 shrink-0 text-[var(--text-muted)] transition-transform duration-200
          group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--primary)]"
      />
    </Link>
  );
}
