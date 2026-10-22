"use client";

import { Modal } from "@/UI";
import { WEBVISOR_HIDE } from "@/widgets/Analytics/webvisor";
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
		<Modal
			open={open}
			onClose={onClose}
			title="Обратная связь"
			width={520}
			className={WEBVISOR_HIDE}
		>
			<FeedbackForm userEmail={userEmail} onSuccess={onClose} />
		</Modal>
	);
}
