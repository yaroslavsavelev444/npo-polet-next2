"use client";

import { Modal } from "@/UI";
import { FeedbackForm } from "./FeedbackForm";

interface FeedbackDialogProps {
	open: boolean;
	onClose: () => void;
	userEmail?: string;
}

export function FeedbackDialog({
	open,
	onClose,
	userEmail,
}: FeedbackDialogProps) {
	return (
		<Modal open={open} onClose={onClose} title="Обратная связь" width={520}>
			<FeedbackForm userEmail={userEmail} onSuccess={onClose} />
		</Modal>
	);
}
