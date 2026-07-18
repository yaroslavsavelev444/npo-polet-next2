"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	Bug,
	HelpCircle,
	Lightbulb,
	type LucideIcon,
	MessageCircleMore,
	Send,
	ShoppingBag,
	UserRound,
} from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { appToast } from "@/shared/lib/toast";
import { Button, Input } from "@/UI";
import { cn } from "@/utils/cn";
import { submitFeedbackAction } from "../actions/submit-feedback";
import {
	FEEDBACK_LIMITS,
	type FeedbackFormData,
	type FeedbackType,
	feedbackFormSchema,
} from "../schemas/feedback.schema";

interface FeedbackFormProps {
	/** Email авторизованного пользователя — подставляется, но остаётся редактируемым. */
	userEmail?: string;
	/** Вызывается после успешной отправки (закрывает модальное окно). */
	onSuccess?: () => void;
}

/**
 * Категории обращения. Сетка-переключатель с иконками — сознательно вместо
 * нативного <select>: на 6 равнозначных категорий она читается за один взгляд,
 * а не через раскрытие списка. Значения совпадают с enum коллекции Feedbacks.
 */
const CATEGORIES: {
	value: FeedbackType;
	label: string;
	icon: LucideIcon;
	tint: string;
}[] = [
	{ value: "bug", label: "Ошибка / баг", icon: Bug, tint: "#FF6B6B" },
	{
		value: "improvement",
		label: "Улучшение",
		icon: Lightbulb,
		tint: "#FFB020",
	},
	{ value: "question", label: "Вопрос", icon: HelpCircle, tint: "#008CFF" },
	{
		value: "order_issue",
		label: "Проблема с заказом",
		icon: ShoppingBag,
		tint: "#FF8A3D",
	},
	{
		value: "account_issue",
		label: "Проблема с аккаунтом",
		icon: UserRound,
		tint: "#26C6DA",
	},
	{
		value: "other",
		label: "Другое",
		icon: MessageCircleMore,
		tint: "#A0A0A0",
	},
];

export function FeedbackForm({ userEmail, onSuccess }: FeedbackFormProps) {
	const {
		register,
		handleSubmit,
		watch,
		reset,
		setValue,
		getValues,
		formState: { errors, isSubmitting },
	} = useForm<FeedbackFormData>({
		resolver: zodResolver(feedbackFormSchema),
		mode: "onTouched",
		defaultValues: {
			type: "bug",
			title: "",
			description: "",
			email: userEmail ?? "",
		},
	});

	// Сессия подгружается асинхронно (FeedbackButton). Подставляем email, только
	// если пользователь ещё ничего не ввёл — чтобы не затирать ручную правку.
	useEffect(() => {
		if (userEmail && !getValues("email")) {
			setValue("email", userEmail, { shouldValidate: false });
		}
	}, [userEmail, getValues, setValue]);

	const selectedType = watch("type");
	const titleValue = watch("title") ?? "";
	const descriptionValue = watch("description") ?? "";

	const onSubmit = async (data: FeedbackFormData) => {
		const result = await submitFeedbackAction(data);

		if (result.success) {
			appToast.success("Спасибо! Обращение отправлено.");
			reset();
			onSuccess?.();
			return;
		}

		appToast.error(result.error);
	};

	return (
		<form
			onSubmit={handleSubmit(onSubmit)}
			className="flex flex-col gap-5"
			noValidate
		>
			<p className="text-sm text-[var(--text-secondary)] leading-relaxed">
				Расскажите, что случилось или что можно улучшить. Мы читаем каждое
				обращение и ответим на указанный email.
			</p>

			{/* ── Категория (сигнатурный элемент) ──────────────────────────── */}
			<fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
				<legend className="text-sm font-medium text-[var(--text-primary)] mb-2 p-0">
					Тип обращения
				</legend>
				<div className="grid grid-cols-2 gap-2">
					{CATEGORIES.map((cat) => {
						const Icon = cat.icon;
						const isSelected = selectedType === cat.value;
						return (
							<label
								key={cat.value}
								className={cn(
									"group relative flex items-center gap-3 rounded-[var(--radius-md)] border p-3 cursor-pointer",
									"transition-colors duration-150",
									isSelected
										? "border-[var(--primary)] bg-[rgba(255,69,0,0.10)]"
										: "border-[var(--border)] bg-[var(--surface-secondary)] hover:border-[var(--text-muted)]",
								)}
							>
								<input
									type="radio"
									value={cat.value}
									{...register("type")}
									className="sr-only peer"
								/>
								<span
									className={cn(
										"flex items-center justify-center w-9 h-9 rounded-[var(--radius-sm)] shrink-0",
										"transition-colors duration-150",
										isSelected
											? "bg-[var(--primary)]"
											: "bg-[color-mix(in_srgb,var(--surface)_60%,transparent)]",
									)}
								>
									<Icon
										className="w-[18px] h-[18px]"
										style={{ color: isSelected ? "#fff" : cat.tint }}
										aria-hidden
									/>
								</span>
								<span
									className={cn(
										"text-sm leading-tight",
										isSelected
											? "text-[var(--text-primary)] font-medium"
											: "text-[var(--text-secondary)]",
									)}
								>
									{cat.label}
								</span>
								{/* Кольцо фокуса для доступности при навигации с клавиатуры */}
								<span className="pointer-events-none absolute inset-0 rounded-[var(--radius-md)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--primary)] peer-focus-visible:ring-offset-0" />
							</label>
						);
					})}
				</div>
				{errors.type && (
					<p className="text-xs text-[var(--error)]">{errors.type.message}</p>
				)}
			</fieldset>

			{/* ── Заголовок ────────────────────────────────────────────────── */}
			<Input
				label="Заголовок"
				placeholder="Коротко о сути обращения"
				maxLength={FEEDBACK_LIMITS.title.max}
				errorMessage={errors.title?.message}
				helperText={`${titleValue.length}/${FEEDBACK_LIMITS.title.max}`}
				{...register("title")}
			/>

			{/* ── Описание ─────────────────────────────────────────────────── */}
			<Input
				label="Описание"
				multiline
				rows={5}
				placeholder="Опишите подробнее: что произошло, какие шаги привели к проблеме, чего вы ожидали"
				maxLength={FEEDBACK_LIMITS.description.max}
				errorMessage={errors.description?.message}
				helperText={`${descriptionValue.length}/${FEEDBACK_LIMITS.description.max}`}
				{...register("description")}
			/>

			{/* ── Email ────────────────────────────────────────────────────── */}
			<Input
				label="Email для связи"
				type="email"
				inputMode="email"
				autoComplete="email"
				placeholder="you@example.com"
				errorMessage={errors.email?.message}
				helperText="Ответим на этот адрес"
				{...register("email")}
			/>

			<Button
				type="submit"
				fullWidth
				loading={isSubmitting}
				disabled={isSubmitting}
				leftIcon={<Send className="w-4 h-4" />}
			>
				{isSubmitting ? "Отправляем…" : "Отправить обращение"}
			</Button>
		</form>
	);
}
