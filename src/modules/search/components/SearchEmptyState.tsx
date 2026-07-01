import { SearchX } from 'lucide-react'

interface SearchEmptyStateProps {
  query: string
}

export function SearchEmptyState({ query }: SearchEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <SearchX className="h-6 w-6 text-white/30" aria-hidden />
      <p className="text-sm font-medium text-white">Ничего не найдено</p>
      <p className="text-xs text-white/50">
        По запросу «{query}» ничего не найдено. Попробуйте изменить формулировку.
      </p>
    </div>
  )
}