export { getEmailConfig } from "./config.ts";
export { EmailService, emailService } from "./EmailService.ts";
export {
	EmailConfigError,
	EmailDeliveryError,
	EmailError,
	EmailTemplateError,
} from "./errors.ts";
export { getAdminEmailAddresses } from "./recipients/getAdminEmails.ts";
export { accountLockedEmailTemplate } from "./templates/auth/account-locked.template.ts";
export { newSessionLoginEmailTemplate } from "./templates/auth/new-session-login.template.ts";
export type {
	OtpEmailData,
	OtpEmailPurpose,
} from "./templates/auth/otp-code.template.ts";
export { otpEmailTemplate } from "./templates/auth/otp-code.template.ts";
export { passwordChangedEmailTemplate } from "./templates/auth/password-changed.template.ts";
export type { PasswordResetEmailData } from "./templates/auth/password-reset.template.ts";
export { passwordResetEmailTemplate } from "./templates/auth/password-reset.template.ts";
export type { FeedbackCreatedAdminEmailData } from "./templates/feedback/feedback-created-admin.template.ts";
export { feedbackCreatedAdminEmailTemplate } from "./templates/feedback/feedback-created-admin.template.ts";
export { orderCancelledEmailTemplate } from "./templates/orders/order-cancelled.template.ts";
export { orderCreatedAdminEmailTemplate } from "./templates/orders/order-created-admin.template.ts";
export { orderCreatedUserEmailTemplate } from "./templates/orders/order-created-user.template.ts";
export { orderStatusChangedEmailTemplate } from "./templates/orders/order-status-changed.template.ts";
export { emailTemplates } from "./templates/registry.ts";
export { reviewStatusChangedEmailTemplate } from "./templates/reviews/review-status-changed.template.ts";

export type {
	EmailAddress,
	EmailTemplate,
	RenderedEmail,
	SendEmailOptions,
	SendEmailResult,
} from "./types.ts";
