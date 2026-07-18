"use client";

import { Modal } from "@/UI";
import { ReviewForm } from "./ReviewForm";

interface ReviewFormDialogProps {
	open: boolean;
	onClose: () => void;
	productId: string;
	productTitle: string;
	onSuccess?: () => void;
}

export function ReviewFormDialog({
	open,
	onClose,
	productId,
	productTitle,
	onSuccess,
}: ReviewFormDialogProps) {
	return (
		<Modal open={open} onClose={onClose} title="Оставить отзыв" width={520}>
			<ReviewForm
				productId={productId}
				productTitle={productTitle}
				onSuccess={() => {
					onSuccess?.();
					onClose();
				}}
			/>
		</Modal>
	);
}
