/**
 * Выбрасываются из checkUserStatus (beforeLogin-хук Users, см.
 * src/payload/hooks/users/beforeLogin.ts) вместо обычного Error — так
 * loginAction (см. classifyLoginError в errorHandling.ts) отличает их от
 * Payload'овских AuthenticationError/LockedAuth через instanceof, не
 * полагаясь на сравнение текста сообщения.
 */
export class AccountBlockedError extends Error {
  constructor(message = "Ваш аккаунт заблокирован. Обратитесь в поддержку.") {
    super(message);
    this.name = "AccountBlockedError";
  }
}

export class AccountSuspendedError extends Error {
  constructor(message = "Ваш аккаунт приостановлен. Обратитесь в поддержку.") {
    super(message);
    this.name = "AccountSuspendedError";
  }
}
