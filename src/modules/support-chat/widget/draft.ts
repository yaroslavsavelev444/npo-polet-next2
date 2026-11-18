import type { SupportTopic } from "../lib/constants";
import type { MessageContext, SupportAttachmentDTO } from "../lib/events";

export interface WidgetDraft {
	text: string;
	attachments: SupportAttachmentDTO[];
	context: MessageContext | null;
	topic: SupportTopic;
	uploading: number;
}

export type UpdateWidgetDraft = (
	key: string,
	update: (draft: WidgetDraft) => WidgetDraft,
) => void;

export const emptyWidgetDraft: WidgetDraft = {
	text: "",
	attachments: [],
	context: null,
	topic: "other",
	uploading: 0,
};
