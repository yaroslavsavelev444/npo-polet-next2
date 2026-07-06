// src/components/consents/ConsentsListSkeleton.tsx
const SKELETON_COUNT = 4;

function SkeletonRow() {
  return (
    <div
      className="relative flex items-center gap-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] p-5"
      style={{ background: "var(--surface)" }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
          animation: "consent-skeleton-sweep 1.8s ease-in-out infinite",
        }}
      />
      <div
        className="h-11 w-11 shrink-0 rounded-[var(--radius-md)]"
        style={{ background: "var(--surface-secondary)" }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div
          className="h-4 w-2/5 rounded-md"
          style={{ background: "rgba(0,0,0,0.08)" }}
        />
        <div
          className="h-3.5 w-4/5 rounded-md"
          style={{ background: "rgba(0,0,0,0.06)" }}
        />
      </div>
    </div>
  );
}

export function ConsentsListSkeleton() {
  return (
    <>
      <style>{`
        @keyframes consent-skeleton-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
      <div className="flex w-full flex-col gap-3">
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </>
  );
}
