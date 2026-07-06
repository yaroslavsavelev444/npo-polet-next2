// src/components/consents/ConsentsList.tsx
import { Suspense } from "react";
import { getCachedConsents } from "@/payload/services/consents.service";
import { Reveal } from "@/UI";
import { ConsentCard } from "./ConsentCard";
import { ConsentsListSkeleton } from "./ConsentsListSkeleton";

async function ConsentsListContent() {
  const { docs } = await getCachedConsents();

  if (!docs.length) {
    return (
      <p className="py-12 text-center text-[var(--text-secondary)]">
        Соглашения пока не добавлены
      </p>
    );
  }

  return (
    <div
      className="flex w-full flex-col gap-3"
      role="list"
      aria-label="Соглашения"
    >
      {docs.map((consent, index) => (
        <Reveal key={consent.id} translateY={12} fillWidth delay={index * 0.05}>
          <div role="listitem">
            <ConsentCard consent={consent} />
          </div>
        </Reveal>
      ))}
    </div>
  );
}

export function ConsentsList() {
  return (
    <Suspense fallback={<ConsentsListSkeleton />}>
      <ConsentsListContent />
    </Suspense>
  );
}
