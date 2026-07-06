export { getEmailConfig } from "./config";
export { EmailService, emailService } from "./EmailService";
export {
  EmailConfigError,
  EmailDeliveryError,
  EmailError,
  EmailTemplateError,
} from "./errors";
export { getAdminEmailAddresses } from "./recipients/getAdminEmails";
export { accountLockedEmailTemplate } from "./templates/auth/account-locked.template";
export { newSessionLoginEmailTemplate } from "./templates/auth/new-session-login.template";
export type {
  OtpEmailData,
  OtpEmailPurpose,
} from "./templates/auth/otp-code.template";
export { otpEmailTemplate } from "./templates/auth/otp-code.template";
export { passwordChangedEmailTemplate } from "./templates/auth/password-changed.template";
export { orderCancelledEmailTemplate } from "./templates/orders/order-cancelled.template";
export { orderCreatedAdminEmailTemplate } from "./templates/orders/order-created-admin.template";
export { orderCreatedUserEmailTemplate } from "./templates/orders/order-created-user.template";
export { orderStatusChangedEmailTemplate } from "./templates/orders/order-status-changed.template";
export { emailTemplates } from "./templates/registry";

export { reviewStatusChangedEmailTemplate } from "./templates/reviews/review-status-changed.template";

export type {
  EmailAddress,
  EmailTemplate,
  RenderedEmail,
  SendEmailOptions,
  SendEmailResult,
} from "./types";
