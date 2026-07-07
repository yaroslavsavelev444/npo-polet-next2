import { accountLockedEmailTemplate } from "./auth/account-locked.template.ts";
import { newSessionLoginEmailTemplate } from "./auth/new-session-login.template.ts";
import { otpEmailTemplate } from "./auth/otp-code.template.ts";
import { passwordChangedEmailTemplate } from "./auth/password-changed.template.ts";
import { orderCancelledEmailTemplate } from "./orders/order-cancelled.template.ts";
import { orderCreatedAdminEmailTemplate } from "./orders/order-created-admin.template.ts";
import { orderCreatedUserEmailTemplate } from "./orders/order-created-user.template.ts";
import { orderStatusChangedEmailTemplate } from "./orders/order-status-changed.template.ts";
import { reviewStatusChangedEmailTemplate } from "./reviews/review-status-changed.template.ts";

export const emailTemplates = {
  otp: otpEmailTemplate,
  passwordChanged: passwordChangedEmailTemplate,
  newSessionLogin: newSessionLoginEmailTemplate,
  accountLocked: accountLockedEmailTemplate,
  orderCreatedUser: orderCreatedUserEmailTemplate,
  orderCreatedAdmin: orderCreatedAdminEmailTemplate,
  orderStatusChanged: orderStatusChangedEmailTemplate,
  orderCancelled: orderCancelledEmailTemplate,
  reviewStatusChanged: reviewStatusChangedEmailTemplate,
} as const;
