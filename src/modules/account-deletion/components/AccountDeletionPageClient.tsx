"use client";

import {
	AlertTriangle,
	Ban,
	CheckCircle2,
	Clock3,
	Database,
	Lock,
	ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { cn } from "@/utils/cn";
import { Block, Button, Input } from "@/UI";
import type { AccountDeletionView } from "../lib/service";

type Props = {
	request: AccountDeletionView | null;
	createRequest: (input: {
		password: string;
		acknowledged: boolean;
	}) => Promise<AccountDeletionView>;
	cancelRequest: (requestId: string) => Promise<AccountDeletionView>;
};

function formatDate(value: string) {
	return new Intl.DateTimeFormat("ru-RU", {
		dateStyle: "long",
		timeStyle: "short",
	}).format(new Date(value));
}

function timeLeft(scheduledFor: string, now: number) {
	const delta = Math.max(0, new Date(scheduledFor).getTime() - now);
	const days = Math.floor(delta / 86_400_000);
	const hours = Math.floor((delta % 86_400_000) / 3_600_000);
	return { days, hours };
}

const RISKS = [
	{
		icon: Clock3,
		text: "Через 14 дней аккаунт, сессии, корзина, избранное, отзывы и обращения будут удалены.",
	},
	{
		icon: Database,
		text: "Данные в заказах, которые необходимо хранить для бухгалтерского учёта, будут обезличены.",
	},
	{
		icon: Ban,
		text: "После начала исполнения восстановить аккаунт и данные нельзя.",
	},
];

export function AccountDeletionPageClient({
	request: initialRequest,
	createRequest,
	cancelRequest,
}: Props) {
	const [request, setRequest] = useState(initialRequest);
	const [password, setPassword] = useState("");
	const [acknowledged, setAcknowledged] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const [clock, setClock] = useState(() => Date.now());

	useEffect(() => {
		if (request?.status !== "pending") return;
		const timer = window.setInterval(() => setClock(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, [request?.status]);

	const isCancellable =
		request?.status === "pending" &&
		new Date(request.scheduledFor).getTime() > Date.now();

	const remaining = useMemo(
		() => (request ? timeLeft(request.scheduledFor, clock) : null),
		[request, clock],
	);

	const progressPct = useMemo(() => {
		if (!request) return 0;
		const start = new Date(request.requestedAt).getTime();
		const end = new Date(request.scheduledFor).getTime();
		if (end <= start) return 100;
		return Math.min(100, Math.max(0, ((clock - start) / (end - start)) * 100));
	}, [request, clock]);

	function submit() {
		setError(null);
		startTransition(async () => {
			try {
				const next = await createRequest({ password, acknowledged });
				setRequest(next);
				setPassword("");
			} catch (cause) {
				setError(
					cause instanceof Error
						? cause.message
						: "Не удалось отправить заявку",
				);
			}
		});
	}

	function cancel() {
		if (!request) return;
		setError(null);
		startTransition(async () => {
			try {
				setRequest(await cancelRequest(request.id));
			} catch (cause) {
				setError(
					cause instanceof Error ? cause.message : "Не удалось отменить заявку",
				);
			}
		});
	}

	return (
		<main className="w-full max-w-2xl mx-auto py-10 px-4 sm:py-14">
			<Block
				variant="elevated"
				size="xl"
				header={
					<div className="flex items-start gap-4">
						<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--error)]/10 text-[var(--error)]">
							<ShieldAlert className="h-6 w-6" aria-hidden />
						</div>
						<div className="min-w-0">
							<p className="text-lg font-semibold leading-snug text-[var(--text-primary)]">
								Удаление аккаунта и персональных данных
							</p>
							<p className="mt-1 text-sm text-[var(--text-secondary)]">
								Управление запросом в соответствии с правом на удаление данных
							</p>
						</div>
					</div>
				}
			>
				{request && request.status === "pending" ? (
					<div className="flex flex-col gap-5">
						<div className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-5">
							<div className="flex items-center gap-2">
								<Clock3
									className="h-4 w-4 shrink-0 text-[var(--warning)]"
									aria-hidden
								/>
								<p className="text-sm font-semibold text-[var(--text-primary)]">
									Заявка ожидает исполнения
								</p>
							</div>

							{remaining && (
								<div className="flex items-baseline gap-2">
									<span className="text-3xl font-bold tabular-nums text-[var(--text-primary)]">
										{remaining.days} дн. {remaining.hours} ч.
									</span>
									<span className="text-sm text-[var(--text-secondary)]">
										до удаления
									</span>
								</div>
							)}

							<div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]">
								<div
									className="h-full rounded-full bg-[var(--warning)] transition-[width] duration-500"
									style={{ width: `${progressPct}%` }}
								/>
							</div>

							<p className="text-sm text-[var(--text-secondary)]">
								Исполнение начнётся после {formatDate(request.scheduledFor)}.
							</p>
						</div>

						<p className="text-sm leading-relaxed text-[var(--text-secondary)]">
							Пока действует 14-дневный период, вы можете отменить запрос. После
							начала исполнения отмена технически невозможна.
						</p>

						{isCancellable && (
							<Button
								variant="outline"
								disabled={isPending}
								loading={isPending}
								onClick={cancel}
								className="border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-white"
							>
								Отменить запрос на удаление
							</Button>
						)}
					</div>
				) : request?.status === "completed" ? (
					<div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--success)]/30 bg-[var(--success)]/5 p-5">
						<CheckCircle2
							className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success)]"
							aria-hidden
						/>
						<p className="text-sm text-[var(--text-secondary)]">
							Заявка выполнена{" "}
							{request.executedAt ? formatDate(request.executedAt) : ""}.
							Аккаунт и связанные персональные данные удалены или обезличены.
						</p>
					</div>
				) : request?.status === "executing" ? (
					<div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-5">
						<Clock3
							className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning)]"
							aria-hidden
						/>
						<p className="text-sm text-[var(--text-secondary)]">
							Заявка уже исполняется. Отменить её больше нельзя.
						</p>
					</div>
				) : (
					<div className="flex flex-col gap-5">
						{request?.status === "cancelled" && (
							<div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--success)]/30 bg-[var(--success)]/5 p-4">
								<CheckCircle2
									className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success)]"
									aria-hidden
								/>
								<p className="text-sm text-[var(--text-secondary)]">
									Предыдущая заявка отменена. При необходимости можно создать
									новую.
								</p>
							</div>
						)}
						{request?.status === "failed" && (
							<div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--error)]/30 bg-[var(--error)]/5 p-4">
								<ShieldAlert
									className="mt-0.5 h-5 w-5 shrink-0 text-[var(--error)]"
									aria-hidden
								/>
								<p className="text-sm text-[var(--text-secondary)]">
									Заявка требует обработки оператором. Обратитесь в службу
									поддержки, не создавая повторные запросы.
								</p>
							</div>
						)}

						<div className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--error)]/25 bg-[var(--error)]/5 p-5">
							<p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
								<AlertTriangle
									className="h-4 w-4 shrink-0 text-[var(--error)]"
									aria-hidden
								/>
								Необратимо после окончания периода ожидания
							</p>
							<ul className="flex flex-col gap-3">
								{RISKS.map(({ icon: Icon, text }) => (
									<li
										key={text}
										className="flex gap-3 text-sm leading-relaxed text-[var(--text-secondary)]"
									>
										<Icon
											className="mt-0.5 h-4 w-4 shrink-0 text-[var(--error)]"
											aria-hidden
										/>
										<span>{text}</span>
									</li>
								))}
							</ul>
						</div>

						<Input
							label="Подтвердите пароль"
							type="password"
							autoComplete="current-password"
							leftIcon={<Lock className="h-4 w-4" />}
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							disabled={isPending || request?.status === "failed"}
						/>

						<label
							className={cn(
								"flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-4 text-sm leading-relaxed transition-colors",
								acknowledged
									? "border-[var(--error)]/50 bg-[var(--error)]/5"
									: "border-[var(--border)] hover:border-[var(--border-light)]",
							)}
						>
							<input
								type="checkbox"
								checked={acknowledged}
								onChange={(event) => setAcknowledged(event.target.checked)}
								disabled={isPending || request?.status === "failed"}
								className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--error)]"
							/>
							<span className="text-[var(--text-secondary)]">
								Я понимаю последствия и хочу создать запрос на удаление
								аккаунта.
							</span>
						</label>

						<Button
							variant="danger"
							size="lg"
							fullWidth
							disabled={
								!password ||
								!acknowledged ||
								isPending ||
								request?.status === "failed"
							}
							loading={isPending}
							onClick={submit}
						>
							Создать запрос на удаление
						</Button>
					</div>
				)}
				{error && (
					<p role="alert" className="text-sm text-[var(--error)]">
						{error}
					</p>
				)}
			</Block>
		</main>
	);
}
