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
  constructor(
    message: string,
    public readonly attempts: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "EmailDeliveryError";
  }
}

export class EmailTemplateError extends EmailError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EmailTemplateError";
  }
}
