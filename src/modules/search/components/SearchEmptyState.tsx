import { SearchX } from "lucide-react";
import { AskManagerButton } from "@/modules/support-chat/widget/AskManagerButton";

interface SearchEmptyStateProps {
	query: string;
	/** Закрыть поиск: чат открывается вместо него, а не под ним. */
	onAskManager: () => void;
}

export function SearchEmptyState({
	query,
	onAskManager,
}: SearchEmptyStateProps) {
	return (
		<div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
			<SearchX
				className="h-6 w-6 text-[color:var(--text-primary)]/30"
				aria-hidden
			/>
			<p className="text-sm font-medium text-[color:var(--text-primary)]">
				Ничего не найдено
			</p>
			<p className="text-xs text-[color:var(--text-primary)]/50">
				По запросу «{query}» ничего не найдено. Попробуйте изменить
				формулировку.
			</p>
			<AskManagerButton
				topic="other"
				onOpen={onAskManager}
				className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[color:var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
			>
				Спросить менеджера
			</AskManagerButton>
		</div>
	);
}
