import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Expected failure with a stable machine-readable `code`, rendered as
 * problem+json. Clients branch on `code`, never on the human-readable text.
 *
 * `data` adds extension members to the problem document (RFC 9457 allows
 * them), for the facts a client needs to offer a way out — for example the
 * shortest walk that would fit when the requested time is too short.
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    detail: string,
    readonly data?: Readonly<Record<string, unknown>>,
  ) {
    super(detail, status);
  }

  static unauthorized(code: string, detail: string): AppError {
    return new AppError(HttpStatus.UNAUTHORIZED, code, detail);
  }

  static notFound(code: string, detail: string): AppError {
    return new AppError(HttpStatus.NOT_FOUND, code, detail);
  }

  static badRequest(code: string, detail: string): AppError {
    return new AppError(HttpStatus.BAD_REQUEST, code, detail);
  }

  static conflict(code: string, detail: string): AppError {
    return new AppError(HttpStatus.CONFLICT, code, detail);
  }

  static tooManyRequests(code: string, detail: string): AppError {
    return new AppError(HttpStatus.TOO_MANY_REQUESTS, code, detail);
  }

  static forbidden(code: string, detail: string): AppError {
    return new AppError(HttpStatus.FORBIDDEN, code, detail);
  }
}
