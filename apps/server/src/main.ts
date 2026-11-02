#!/usr/bin/env node
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.js';
import { ConfigError, loadServerConfig } from './config.js';

async function main(): Promise<void> {
  const log = new Logger('Server');
  let config;
  try {
    config = loadServerConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      log.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
  const app = await createApp(config);
  app.enableShutdownHooks();
  const server = app.getHttpServer() as {
    requestTimeout: number;
    headersTimeout: number;
  };
  // Scans run in the worker, so no request needs long: POST /scans answers 202 straight away.
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  await app.listen(config.port, config.host);
  const url = await app.getUrl();
  log.log(
    `Listening on ${url} (queue: ${config.redisUrl ? 'BullMQ' : `SQLite ${config.dbPath}`}, workers: ${config.workers}, auth: ${config.token ? 'bearer token' : 'off (loopback only)'})`,
  );
}

await main();
