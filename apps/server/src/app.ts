import 'reflect-metadata';
import { STATUS_CODES } from 'node:http';
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
  type INestApplication,
  type LoggerService,
  type LogLevel,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ServerConfig } from './config.js';
import { AppModule, type AppOverrides } from './app.module.js';

interface JsonResponse {
  status(code: number): JsonResponse;
  json(body: unknown): void;
  headersSent?: boolean;
}

/**
 * Errors as `{ statusCode, error, message, issues? }`. Unexpected errors become a generic 500
 * (details go to the server log, never to the client).
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<JsonResponse>();
    if (res.headersSent) return;
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const obj = typeof body === 'string' ? { message: body } : (body as Record<string, unknown>);
      res.status(status).json({
        statusCode: status,
        ...obj,
        error: STATUS_CODES[status] ?? 'Error',
      });
      return;
    }
    // body-parser errors (too large, malformed JSON) carry a status.
    const e = exception as { status?: number; type?: string; message?: string };
    if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500) {
      const message =
        e.type === 'entity.too.large'
          ? 'Request body is too large.'
          : e.type === 'entity.parse.failed'
            ? 'Request body is not valid JSON.'
            : 'Bad request.';
      res
        .status(e.status)
        .json({ statusCode: e.status, error: STATUS_CODES[e.status] ?? 'Error', message });
      return;
    }
    this.log.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    res
      .status(500)
      .json({ statusCode: 500, error: 'Internal Server Error', message: 'Internal server error.' });
  }
}

export interface CreateAppOptions extends AppOverrides {
  logger?: LoggerService | LogLevel[] | false;
}

/** Builds the Nest app (not listening yet). Used by `main.ts` and the tests. */
export async function createApp(
  config: ServerConfig,
  options: CreateAppOptions = {},
): Promise<INestApplication> {
  const { logger, ...overrides } = options;
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(config, overrides),
    {
      bodyParser: false,
      ...(logger !== undefined ? { logger } : {}),
    },
  );
  app.useBodyParser('json', { limit: config.maxBodyBytes });
  const express = app.getHttpAdapter().getInstance() as {
    disable(name: string): void;
    set(name: string, value: unknown): void;
  };
  express.disable('x-powered-by');
  if (config.trustProxy) express.set('trust proxy', true);
  app.use((_req: unknown, res: { setHeader(n: string, v: string): void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.useGlobalFilters(new ErrorFilter());
  return app;
}
