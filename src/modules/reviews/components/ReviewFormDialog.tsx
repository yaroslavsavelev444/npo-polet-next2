"use client";

import { Modal } from "@/UI";
import { ReviewForm } from "./ReviewForm";

interface ReviewFormDialogProps {
	open: boolean;
	onClose: () => void;
	productId: string;
	productTitle: string;
	/** Оценка, выбранная до открытия формы (звёзды на карточке «Можно оценить»). */
	initialRating?: number;
	onSuccess?: () => void;
}

export function ReviewFormDialog({
	open,
	onClose,
	productId,
	productTitle,
	initialRating,
	onSuccess,
}: ReviewFormDialogProps) {
	return (
		<Modal open={open} onClose={onClose} title="Оставить отзыв" width={520}>
			<ReviewForm
				productId={productId}
				productTitle={productTitle}
				initialRating={initialRating}
				onSuccess={() => {
					onSuccess?.();
					onClose();
				}}
			/>
		</Modal>
	);
}
