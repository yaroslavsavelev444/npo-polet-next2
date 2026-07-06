// src/components/contacts/ContactActions.tsx
"use client";

import { Check, Copy, Download, QrCode, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/UI";
import { Text } from "@/UI/Typography/Typography";
import { downloadVCard } from "../lib/download-vcard";
import { shareContact } from "../lib/share-contact";
import type { Email, Phone } from "../types";
import { QRDialog } from "./QRDialog";

interface ContactActionsProps {
  companyName: string;
  phones: Phone[];
  emails: Email[];
  physicalAddress?: string | null;
}

export function ContactActions({
  companyName = "",
  phones = [],
  emails = [],
  physicalAddress = null,
}: ContactActionsProps) {
  const [qrOpen, setQrOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const handleShare = async () => {
    try {
      await shareContact(companyName);
    } catch {
      // Если share не поддерживается или отменено, копируем URL (уже внутри shareContact)
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  return (
    <>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* QR-код */}
        <Button
          variant="outline"
          fullWidth
          onClick={() => setQrOpen(true)}
          className="flex-col items-center py-6 h-auto"
        >
          <QrCode className="w-6 h-6 mb-2" />
          <Text size="sm" className="font-medium">
            QR-код контактов
          </Text>
          <Text size="sm" color="muted">
            Сохраните контакты в телефон
          </Text>
        </Button>

        {/* Скачать vCard */}
        <Button
          variant="outline"
          fullWidth
          onClick={() =>
            downloadVCard(companyName, phones, emails, physicalAddress)
          }
          className="flex-col items-center py-6 h-auto"
        >
          <Download className="w-6 h-6 mb-2" />
          <Text size="sm" className="font-medium">
            Скачать vCard
          </Text>
          <Text size="sm" color="muted">
            Импорт в адресную книгу
          </Text>
        </Button>

        {/* Поделиться */}
        <Button
          variant="outline"
          fullWidth
          onClick={handleShare}
          className="flex-col items-center py-6 h-auto"
        >
          {shareCopied ? (
            <Check className="w-6 h-6 mb-2 text-[var(--success)]" />
          ) : (
            <Share2 className="w-6 h-6 mb-2" />
          )}
          <Text size="sm" className="font-medium">
            Поделиться
          </Text>
          <Text size="sm" color="muted">
            {shareCopied ? "Ссылка скопирована" : "Отправить контакты"}
          </Text>
        </Button>
      </div>

      <QRDialog
        isOpen={qrOpen}
        onClose={() => setQrOpen(false)}
        companyName={companyName}
        phones={phones}
        emails={emails}
        physicalAddress={physicalAddress}
      />
    </>
  );
}
