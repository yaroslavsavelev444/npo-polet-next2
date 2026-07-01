// src/modules/feedback/components/FeedbackDialog.tsx
'use client';

import { Modal } from '@/UI';
import { FeedbackForm } from './FeedbackForm';

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;      // изменено
  userEmail?: string;
}

export function FeedbackDialog({ open, onClose, userEmail }: FeedbackDialogProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <FeedbackForm
        userEmail={userEmail}
        onSuccess={onClose}   // при успехе закрываем окно
      />
    </Modal>
  );
}