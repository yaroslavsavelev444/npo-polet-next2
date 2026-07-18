import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton } from "../shared/button.ts";
import { escapeHtml } from "../shared/escapeHtml.ts";
import { renderEmailLayout } from "../shared/layout.ts";

export interface ReviewStatusChangedEmailData {
	userName: string;
	productTitle: string;
	status: "approved" | "rejected";
	rejectionReason?: string | null;
	productUrl: string;
}

function render(data: ReviewStatusChangedEmailData): RenderedEmail {
	const isApproved = data.status === "approved";
	const heading = isApproved ? "Ваш отзыв опубликован" : "Ваш отзыв отклонён";
	const message = isApproved
		? `Спасибо! Ваш отзыв на «${escapeHtml(data.productTitle)}» прошёл модерацию и опубликован.`
		: `К сожалению, ваш отзыв на «${escapeHtml(data.productTitle)}» не прошёл модерацию.`;

	const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:${isApproved ? "#18181B" : "#B91C1C"};">${heading}</h1>
    <p style="margin:0 0 12px;color:#52525B;">${escapeHtml(data.userName)}, ${message}</p>
    ${!isApproved && data.rejectionReason ? `<p style="margin:0 0 20px;color:#52525B;">Причина: ${escapeHtml(data.rejectionReason)}</p>` : ""}
    ${renderButton("Открыть товар", data.productUrl)}
  `;

	return {
		subject: heading,
		html: renderEmailLayout({ previewText: message, bodyHtml }),
		text: `${heading}. ${message}`,
	};
}

export const reviewStatusChangedEmailTemplate: EmailTemplate<ReviewStatusChangedEmailData> =
	{
		id: "review-status-changed",
		render,
	};
