// src/services/email/errors.ts
export class EmailError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "EmailError";
    if (options?.cause) this.cause = options.cause;
  }
}

export class EmailConfigError extends EmailError {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigError";
  }
}

export class EmailDeliveryError extends EmailError {
  public readonly attempts: number;

  constructor(
    message: string,
    attempts: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "EmailDeliveryError";
    this.attempts = attempts; // явное присваивание вместо parameter property
  }
}

export class EmailTemplateError extends EmailError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmailTemplateError";
  }
}
