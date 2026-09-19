import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import { type Request, type Response } from 'express';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import { type ZodError } from 'zod';
import { AppError } from './app-error';

/** RFC 9457 problem details, the only error shape the API returns. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  /** Stable error code for client logic, e.g. `tour_not_found`. */
  code?: string;
  /** Field-level validation errors. */
  errors?: { path: string; message: string }[];
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const problem = this.toProblem(exception);
    problem.instance = request.originalUrl;

    if (problem.status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof ZodValidationException) {
      const error = exception.getZodError() as ZodError;
      return {
        type: 'about:blank',
        title: 'Bad Request',
        status: HttpStatus.BAD_REQUEST,
        code: 'validation_failed',
        detail: 'Request validation failed',
        errors: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      };
    }

    if (exception instanceof ZodSerializationException) {
      // The response did not match its own schema: a server bug, not a client error.
      return internalError();
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        type: 'about:blank',
        title: STATUS_CODES[status] ?? 'Error',
        status,
        detail: exception.message,
        code: exception instanceof AppError ? exception.code : undefined,
      };
    }

    return internalError();
  }
}

function internalError(): ProblemDetails {
  return {
    type: 'about:blank',
    title: 'Internal Server Error',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  };
}
