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
	/** Вызывается после успешной отправки — закрывает модальное окно. */
	onSuccess?: () => void;
}

export function ReviewForm({
	productId,
	productTitle,
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
		defaultValues: { rating: 0, comment: "" },
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
