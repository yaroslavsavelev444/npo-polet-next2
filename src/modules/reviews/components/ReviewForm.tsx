"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { appToast } from "@/shared/lib/toast";
import { Button, Input } from "@/UI";
import { submitReviewAction } from "../actions/submit-review";
import {
	REVIEW_LIMITS,
	type ReviewFormData,
	reviewFormSchema,
} from "../schemas/review.schema";
import { StarRatingInput } from "./StarRatingInput";

interface ReviewFormProps {
	productId: string;
	productTitle: string;
	/**
	 * Оценка, выбранная ещё до открытия формы. Нужна разделу «Можно оценить»:
	 * там звёзды стоят прямо на карточке товара и нажатие на них одновременно
	 * открывает форму и отвечает на её первый вопрос. Переспрашивать то, что
	 * человек только что выбрал, — терять сделанный им шаг.
	 */
	initialRating?: number;
	/** Вызывается после успешной отправки — закрывает модальное окно. */
	onSuccess?: () => void;
}

export function ReviewForm({
	productId,
	productTitle,
	initialRating,
	onSuccess,
}: ReviewFormProps) {
	const {
		register,
		handleSubmit,
		watch,
		setValue,
		formState: { errors, isSubmitting },
	} = useForm<ReviewFormData>({
		resolver: zodResolver(reviewFormSchema),
		mode: "onTouched",
		// Оценка вне диапазона (чужой вызов компонента) не должна доезжать до
		// формы предвыбранной: 0 просто означает «ещё не выбрано».
		defaultValues: {
			rating:
				typeof initialRating === "number" &&
				initialRating >= 1 &&
				initialRating <= 5
					? Math.trunc(initialRating)
					: 0,
			comment: "",
		},
	});

	const rating = watch("rating");
	const comment = watch("comment") ?? "";

	const onSubmit = async (data: ReviewFormData) => {
		const result = await submitReviewAction(productId, data);
		if (result.success) {
			appToast.success("Спасибо! Отзыв отправлен на модерацию.");
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
			<p className="text-sm leading-relaxed text-[var(--text-secondary)]">
				Поделитесь впечатлением о товаре «{productTitle}». Отзыв появится на
				странице после проверки модератором.
			</p>

			<fieldset className="flex flex-col gap-2 border-0 p-0">
				<legend className="mb-1 p-0 text-sm font-medium text-[var(--text-primary)]">
					Ваша оценка
				</legend>
				<StarRatingInput
					value={rating}
					onChange={(v) =>
						setValue("rating", v, {
							shouldValidate: true,
							shouldTouch: true,
						})
					}
					disabled={isSubmitting}
				/>
				{errors.rating && (
					<p className="text-xs text-[var(--error)]">{errors.rating.message}</p>
				)}
			</fieldset>

			<Input
				label="Комментарий"
				multiline
				rows={5}
				placeholder="Что понравилось, что можно улучшить, как товар показал себя в деле"
				maxLength={REVIEW_LIMITS.comment.max}
				errorMessage={errors.comment?.message}
				helperText={`${comment.length}/${REVIEW_LIMITS.comment.max}`}
				{...register("comment")}
			/>

			<Button
				type="submit"
				fullWidth
				loading={isSubmitting}
				disabled={isSubmitting}
				leftIcon={<Send className="h-4 w-4" />}
			>
				{isSubmitting ? "Отправляем…" : "Отправить отзыв"}
			</Button>
		</form>
	);
}
