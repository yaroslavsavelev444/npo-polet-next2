// src/components/contacts/QRDialog.tsx
"use client";

import { Download } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Button, Modal } from "@/UI";
import { Text } from "@/UI/Typography/Typography";
import { createVCard } from "../lib/create-vcard";
import { downloadVCard } from "../lib/download-vcard";
import type { Email, Phone } from "../types";

interface QRDialogProps {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  phones: Phone[];
  emails: Email[];
  physicalAddress?: string | null;
}

export function QRDialog({
  isOpen,
  onClose,
  companyName,
  phones,
  emails,
  physicalAddress,
}: QRDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const vCard = createVCard({
      companyName,
      phones,
      emails,
      physicalAddress,
    });
    QRCode.toDataURL(vCard, { width: 256, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [isOpen, companyName, phones, emails, physicalAddress]);

  const handleDownload = () => {
    downloadVCard(companyName, phones, emails, physicalAddress);
    onClose();
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="QR-код контактов">
      <div className="text-center py-6">
        {qrDataUrl ? (
          <>
            <img
              src={qrDataUrl}
              alt="QR Code"
              className="w-48 h-48 mx-auto mb-4 rounded-[var(--radius-md)]"
            />
            <Text color="secondary">
              Отсканируйте QR-код, чтобы сохранить контакты в телефон
            </Text>
            <Button
              variant="primary"
              className="mt-4"
              onClick={handleDownload}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Скачать vCard
            </Button>
          </>
        ) : (
          <Text color="secondary">Не удалось сгенерировать QR-код</Text>
        )}
      </div>
    </Modal>
  );
}
