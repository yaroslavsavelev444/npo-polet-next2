export function SearchLoadingState() {
  return (
    <ul className="flex flex-col gap-0.5" aria-hidden>
      {Array.from({ length: 4 }).map((_, index) => (
        <li key={index} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-white/5" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-white/5" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-white/5" />
          </div>
          <div className="h-6 w-16 shrink-0 animate-pulse rounded-full bg-white/5" />
        </li>
      ))}
    </ul>
  )
}