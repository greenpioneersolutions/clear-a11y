import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { createBullQueue, createSqliteQueue } from '@clear-a11y/queue';
import type { ScanJobPayload, ScanJobResult } from '@clear-a11y/queue';
import { scan } from '@clear-a11y/runner';
import type { ServerConfig } from './config.js';
import { HealthController } from './health.controller.js';
import { ScansController } from './scans/scans.controller.js';
import { ScansService } from './scans/scans.service.js';
import { AuthGuard } from './security/auth.guard.js';
import { ScanRateLimitGuard } from './security/rate-limit.js';
import { systemLookup } from './security/ssrf.js';
import { ResultStore } from './storage/result-store.js';
import {
  DNS_LOOKUP,
  JOB_QUEUE,
  RESULT_STORE,
  SCAN_FN,
  SERVER_CONFIG,
  type Lookup,
  type ScanFn,
  type ScanQueue,
} from './tokens.js';
import { WorkerService } from './worker/worker.service.js';

/** Swappable pieces, for tests. */
export interface AppOverrides {
  queue?: ScanQueue;
  scan?: ScanFn;
  lookup?: Lookup;
}

/** SQLite at `CLEAR_A11Y_DB` by default; BullMQ when `REDIS_URL` is set. */
export function openQueue(config: ServerConfig): Promise<ScanQueue> {
  return config.redisUrl
    ? createBullQueue<ScanJobPayload, ScanJobResult>({ url: config.redisUrl })
    : createSqliteQueue<ScanJobPayload, ScanJobResult>({ path: config.dbPath });
}

@Module({})
export class AppModule {
  static forRoot(config: ServerConfig, overrides: AppOverrides = {}): DynamicModule {
    const providers: Provider[] = [
      { provide: SERVER_CONFIG, useValue: config },
      { provide: JOB_QUEUE, useFactory: () => overrides.queue ?? openQueue(config) },
      { provide: SCAN_FN, useValue: overrides.scan ?? scan },
      { provide: RESULT_STORE, useValue: new ResultStore(config.dataDir) },
      { provide: DNS_LOOKUP, useValue: overrides.lookup ?? systemLookup },
      { provide: APP_GUARD, useClass: AuthGuard },
      ScanRateLimitGuard,
      ScansService,
      WorkerService,
    ];
    return {
      module: AppModule,
      controllers: [HealthController, ScansController],
      providers,
    };
  }
}
