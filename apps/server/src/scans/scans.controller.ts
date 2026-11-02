import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import type { z } from 'zod';
import { ScanRateLimitGuard } from '../security/rate-limit.js';
import { FindingsQuerySchema, ListQuerySchema, ReportQuerySchema } from './dto.js';
import { issuesOf, REPORT_CONTENT_TYPES, ScansService } from './scans.service.js';

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

/** Content-Security-Policy for the HTML report (it is self-contained: inline CSS/JS, data: images). */
export const REPORT_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function parseQuery<T extends z.ZodType>(schema: T, query: unknown): z.infer<T> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    throw new BadRequestException({ message: 'Invalid query.', issues: issuesOf(parsed.error) });
  }
  return parsed.data;
}

@Controller('scans')
export class ScansController {
  constructor(@Inject(ScansService) private readonly scans: ScansService) {}

  @Post()
  @HttpCode(202)
  @UseGuards(ScanRateLimitGuard)
  async create(
    @Body() body: unknown,
    @Headers('content-type') contentType: string | undefined,
    @Res({ passthrough: true }) res: HeaderResponse,
  ) {
    if (!contentType || !/^application\/json\b/i.test(contentType)) {
      throw new UnsupportedMediaTypeException('Send the scan request as application/json.');
    }
    const view = await this.scans.create(body);
    res.setHeader('Location', view.links.self);
    return view;
  }

  @Get()
  async list(@Query() query: unknown) {
    return { scans: await this.scans.list(parseQuery(ListQuerySchema, query)) };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.scans.get(id);
  }

  @Delete(':id')
  async cancel(@Param('id') id: string) {
    return this.scans.cancel(id);
  }

  /** The canonical JSON report (same as `report?format=json`). */
  @Get(':id/results')
  async results(@Param('id') id: string, @Res({ passthrough: true }) res: HeaderResponse) {
    const body = await this.scans.report(id, 'json');
    res.setHeader('Content-Type', REPORT_CONTENT_TYPES.json);
    return body;
  }

  @Get(':id/findings')
  async findings(@Param('id') id: string, @Query() query: unknown) {
    const findings = await this.scans.findings(id, parseQuery(FindingsQuerySchema, query));
    return { total: findings.length, findings };
  }

  @Get(':id/report')
  async report(
    @Param('id') id: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: HeaderResponse,
  ) {
    const { format } = parseQuery(ReportQuerySchema, query);
    const body = await this.scans.report(id, format);
    res.setHeader('Content-Type', REPORT_CONTENT_TYPES[format]);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="clear-a11y-${id}.${format === 'sarif' ? 'sarif' : format}"`,
    );
    if (format === 'html') res.setHeader('Content-Security-Policy', REPORT_CSP);
    return body;
  }
}
