"use client";

import { Link2, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";
import type { Setting } from "@/payload-types";
import { Block } from "@/UI";
import { ContactActions } from "./ContactActions";
import { ContactCard } from "./ContactCard";
import { EmailsCard } from "./EmailsCard";
import { OtherContacts } from "./OtherContacts";
import { PhonesCard } from "./PhonesCard";
import { SocialLinks } from "./SocialLinks";

type TabId = "contacts" | "social" | "other";

export function ContactSection({ settings }: { settings: Setting }) {
  const [activeTab, setActiveTab] = useState<TabId>("contacts");

  const tabs = [
    { id: "contacts" as TabId, label: "Контакты", icon: Phone },
    { id: "social" as TabId, label: "Социальные сети", icon: Link2 },
    { id: "other" as TabId, label: "Другие контакты", icon: MessageCircle },
  ];

  return (
    <Block
      title="Контакты"
      subtitle="Свяжитесь с нами удобным для вас способом"
    >
      {/* Табы */}
      <div className="border-b border-[var(--border)] mb-6">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-[var(--primary)] text-[var(--primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Содержимое вкладок */}
      <div className="mt-4">
        {activeTab === "contacts" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <ContactCard
              companyName={settings.companyName}
              legalAddress={settings.legalAddress}
              physicalAddress={settings.physicalAddress}
              workingHours={settings.workingHours}
            />
            <div className="space-y-6">
              {settings.phones && settings.phones.length > 0 && (
                <PhonesCard phones={settings.phones} />
              )}
              {settings.emails && settings.emails.length > 0 && (
                <EmailsCard emails={settings.emails} />
              )}
            </div>
          </div>
        )}
        {activeTab === "social" && (
          <SocialLinks socialLinks={settings.socialLinks || []} />
        )}
        {activeTab === "other" && (
          <OtherContacts otherContacts={settings.otherContacts || []} />
        )}
      </div>

      {/* Кнопки действий */}
      <ContactActions
        companyName={settings.companyName}
        phones={settings.phones ?? []}
        emails={settings.emails ?? []}
        physicalAddress={settings.physicalAddress}
      />
    </Block>
  );
}
