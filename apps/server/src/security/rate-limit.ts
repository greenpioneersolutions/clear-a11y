import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { ServerConfig } from '../config.js';
import { SERVER_CONFIG } from '../tokens.js';

/** Fixed one-minute window per key. Small and in-process; put a proxy in front for more. */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns seconds to wait, or 0 when the request is allowed. */
  take(key: string): number {
    if (this.limit <= 0) return 0;
    const t = this.now();
    if (this.windows.size > 10_000) {
      for (const [k, w] of this.windows) if (t - w.start >= this.windowMs) this.windows.delete(k);
    }
    const w = this.windows.get(key);
    if (!w || t - w.start >= this.windowMs) {
      this.windows.set(key, { start: t, count: 1 });
      return 0;
    }
    if (w.count >= this.limit) return Math.ceil((w.start + this.windowMs - t) / 1000);
    w.count++;
    return 0;
  }
}

/** Limits scan creation per client IP (`RATE_LIMIT_PER_MINUTE`). */
@Injectable()
export class ScanRateLimitGuard implements CanActivate {
  private readonly limiter: FixedWindowLimiter;

  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    this.limiter = new FixedWindowLimiter(config.rateLimitPerMinute);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ ip?: string }>();
    const wait = this.limiter.take(req.ip ?? 'unknown');
    if (!wait) return true;
    context
      .switchToHttp()
      .getResponse<{ setHeader(n: string, v: string): void }>()
      .setHeader('Retry-After', String(wait));
    throw new HttpException('Too many scans; try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
