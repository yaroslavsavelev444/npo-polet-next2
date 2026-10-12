import type { SupportErrorCode } from "../lib/events.ts";

/**
 * Ожидаемый отказ операции чата: у него есть код, который клиент различает
 * (показать «войдите», «примите согласие», «слишком часто»), и текст для
 * человека. Всё, что не SupportError, — непредвиденная ошибка: клиенту уходит
 * `internal` без подробностей, подробности — в журнал ошибок.
 */
export class SupportError extends Error {
	readonly code: SupportErrorCode;

	constructor(code: SupportErrorCode, message: string) {
		super(message);
		this.name = "SupportError";
		this.code = code;
	}
}

export const isSupportError = (error: unknown): error is SupportError =>
	error instanceof SupportError;
