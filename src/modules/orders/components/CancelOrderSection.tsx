"use client";

import { XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { appToast } from "@/shared/lib/toast";
import { Button, Input } from "@/UI";
import { cancelOrderAction } from "../actions/orders.actions";
import type { OrderStatus } from "../types";

interface Props {
  orderId: string;
  canCancel: boolean;
  onCancelled: (status: OrderStatus) => void;
}

export function CancelOrderSection({ orderId, canCancel, onCancelled }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canCancel) return null;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrderAction(orderId, reason);
      if (!result.success) {
        setError(result.message);
        appToast.warning(result.message);
        return;
      }
      appToast.success("Заказ отменён");
      onCancelled(result.data.status);
    });
  }

  return (
    <div className="border-t border-[var(--border)] pt-4">
      {!isOpen ? (
        <Button
          variant="outline"
          onClick={() => setIsOpen(true)}
          leftIcon={<XCircle className="h-4 w-4" />}
          className="border-[var(--error)] text-[var(--error)] hover:bg-[var(--error)] hover:text-white"
        >
          Отменить заказ
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Input
            label="Причина отмены"
            multiline
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Опишите причину отмены заказа"
            errorMessage={error ?? undefined}
            disabled={isPending}
          />
          <div className="flex gap-3">
            <Button
              variant="danger"
              onClick={handleSubmit}
              loading={isPending}
              disabled={isPending || reason.trim().length < 5}
            >
              Подтвердить отмену
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setIsOpen(false);
                setReason("");
                setError(null);
              }}
              disabled={isPending}
            >
              Не отменять
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
