import { accountLockedEmailTemplate } from "./auth/account-locked.template";
import { newSessionLoginEmailTemplate } from "./auth/new-session-login.template";
import { otpEmailTemplate } from "./auth/otp-code.template";
import { passwordChangedEmailTemplate } from "./auth/password-changed.template";
import { orderCancelledEmailTemplate } from "./orders/order-cancelled.template";
import { orderCreatedAdminEmailTemplate } from "./orders/order-created-admin.template";
import { orderCreatedUserEmailTemplate } from "./orders/order-created-user.template";
import { orderStatusChangedEmailTemplate } from "./orders/order-status-changed.template";
import { reviewStatusChangedEmailTemplate } from "./reviews/review-status-changed.template";

/**
 * Единая точка интроспекции всех писем системы. Не обязателен для работы
 * EmailService (шаблон можно передать напрямую в notifyXxx), но полезен
 * для тестов и обзора — "какие письма вообще умеет слать проект".
 */
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
