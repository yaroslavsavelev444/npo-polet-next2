"use client";

import { AlertTriangle, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
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
	return `${days} дн. ${hours} ч.`;
}

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
		<main className="max-w-2xl mx-auto py-10 px-4">
			<Block
				variant="default"
				size="lg"
				title="Удаление аккаунта и персональных данных"
				subtitle="Управление запросом в соответствии с правом на удаление данных"
			>
				{request && request.status === "pending" ? (
					<div className="flex flex-col gap-5">
						<div className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--surface-secondary)] p-4">
							<div className="flex gap-3">
								<Clock3
									className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning)]"
									aria-hidden
								/>
								<div className="space-y-1">
									<p className="font-semibold text-[var(--text-primary)]">
										Заявка ожидает исполнения
									</p>
									<p className="text-sm text-[var(--text-secondary)]">
										До удаления осталось {remaining}. Исполнение начнётся после{" "}
										{formatDate(request.scheduledFor)}.
									</p>
								</div>
							</div>
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
					<div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--success)] p-4">
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
					<div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--warning)] p-4">
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
							<div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--success)] p-4">
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
							<div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--error)] p-4">
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
						<div className="rounded-[var(--radius-md)] border border-[var(--error)] bg-[var(--surface-secondary)] p-4">
							<div className="flex gap-3">
								<AlertTriangle
									className="mt-0.5 h-5 w-5 shrink-0 text-[var(--error)]"
									aria-hidden
								/>
								<div className="space-y-2 text-sm leading-relaxed text-[var(--text-secondary)]">
									<p className="font-semibold text-[var(--text-primary)]">
										Это действие необратимо после окончания периода ожидания.
									</p>
									<ul className="list-disc space-y-1 pl-5">
										<li>
											Через 14 дней аккаунт, сессии, корзина, избранное, отзывы
											и обращения будут удалены.
										</li>
										<li>
											Данные в заказах, которые необходимо хранить для
											бухгалтерского учёта, будут обезличены.
										</li>
										<li>
											После начала исполнения восстановить аккаунт и данные
											нельзя.
										</li>
									</ul>
								</div>
							</div>
						</div>
						<Input
							label="Подтвердите пароль"
							type="password"
							autoComplete="current-password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							disabled={isPending || request?.status === "failed"}
						/>
						<label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-[var(--text-secondary)]">
							<input
								type="checkbox"
								checked={acknowledged}
								onChange={(event) => setAcknowledged(event.target.checked)}
								disabled={isPending || request?.status === "failed"}
								className="mt-1 h-4 w-4"
							/>
							Я понимаю последствия и хочу создать запрос на удаление аккаунта.
						</label>
						<Button
							variant="outline"
							fullWidth
							disabled={
								!password ||
								!acknowledged ||
								isPending ||
								request?.status === "failed"
							}
							loading={isPending}
							onClick={submit}
							className="border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-white"
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
