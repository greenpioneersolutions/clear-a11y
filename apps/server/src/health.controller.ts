import { Controller, Get, Inject } from '@nestjs/common';
import { VERSION } from '@clear-a11y/runner';
import { Public } from './security/auth.guard.js';
import { JOB_QUEUE, type ScanQueue } from './tokens.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(JOB_QUEUE) private readonly queue: ScanQueue) {}

  /** Liveness for Docker HEALTHCHECK and load balancers. No auth, no details beyond this. */
  @Get()
  @Public()
  async health() {
    await this.queue.list({ limit: 1 });
    return { status: 'ok', version: VERSION, queue: this.queue.kind };
  }
}
