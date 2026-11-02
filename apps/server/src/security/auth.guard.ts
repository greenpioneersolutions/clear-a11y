import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ServerConfig } from '../config.js';
import { SERVER_CONFIG } from '../tokens.js';

const PUBLIC_KEY = 'clear-a11y:public';
/** Marks a route as reachable without the bearer token (only /health). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Constant-time comparison of a presented token with the configured one. */
export function tokenMatches(presented: string | undefined, expected: string): boolean {
  if (!presented) return false;
  return timingSafeEqual(digest(presented), digest(expected));
}

export function bearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  const m = value ? /^Bearer\s+(\S+)\s*$/i.exec(value) : null;
  return m?.[1];
}

/** When `CLEAR_A11Y_TOKEN` is set, every route but /health needs `Authorization: Bearer <token>`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.token;
    if (!expected) return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    if (tokenMatches(bearerToken(req.headers['authorization']), expected)) return true;
    const res = context.switchToHttp().getResponse<{ setHeader(n: string, v: string): void }>();
    res.setHeader('WWW-Authenticate', 'Bearer realm="clear-a11y"');
    throw new UnauthorizedException('Missing or invalid bearer token.');
  }
}
