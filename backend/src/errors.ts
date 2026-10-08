/**
 * Application error with HTTP status + machine-readable code.
 * Any service throws AppError; the error middleware maps it to the response.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'Unauthorized') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'Forbidden') => new AppError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);

/** 4xx default for Zod failures surfaced through this helper. */
export const invalid = (message: string, details?: unknown) =>
  new AppError(422, 'validation_error', message, details);
