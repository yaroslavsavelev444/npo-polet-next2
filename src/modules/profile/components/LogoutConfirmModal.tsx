"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button, Modal } from "@/UI";

interface LogoutConfirmModalProps {
  open:    boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function LogoutConfirmModal({ open, onClose, onConfirm }: LogoutConfirmModalProps) {
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      await onConfirm();
      // Parent controls open state; don't call onClose here in case of error
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Выйти из аккаунта?"
      width={400}
      closeOnOverlay={!isPending}
      closeOnEscape={!isPending}
      footer={
        <div className="flex gap-3 w-full">
          <Button
            variant="secondary"
            fullWidth
            disabled={isPending}
            onClick={onClose}
          >
            Отмена
          </Button>
          <Button
            variant="danger"
            fullWidth
            loading={isPending}
            onClick={handleConfirm}
            leftIcon={<LogOut className="w-4 h-4" />}
          >
            Выйти
          </Button>
        </div>
      }
    >
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        Вы будете перенаправлены на страницу входа. Все несохранённые данные будут утеряны.
      </p>
    </Modal>
  );
}