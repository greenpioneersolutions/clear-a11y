import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export interface StaticServer {
  origin: string;
  url(path?: string): string;
  close(): Promise<void>;
}

/** Resolves a request path inside `root`, or null when it escapes the root. */
export function resolveInside(root: string, requestPath: string): string | null {
  const rootAbs = resolve(root);
  const decoded = decodeURIComponent(requestPath.split('?')[0]?.split('#')[0] ?? '/');
  const target = resolve(rootAbs, '.' + normalize('/' + decoded));
  return target === rootAbs || target.startsWith(rootAbs + sep) ? target : null;
}

/**
 * Serves `root` on 127.0.0.1 (random port by default). Local only; never binds a public interface.
 * Used to scan local builds (fixtures, storybook-static, exported sites).
 */
export async function startStaticServer(options: {
  root: string;
  port?: number;
}): Promise<StaticServer> {
  const server: Server = createServer(async (req, res) => {
    let file = resolveInside(options.root, req.url ?? '/');
    if (!file) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    try {
      let info = await stat(file);
      if (info.isDirectory()) {
        file = join(file, 'index.html');
        info = await stat(file);
      }
      res.writeHead(200, {
        'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-length': info.size,
        'cache-control': 'no-store',
      });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    }
  });
  await new Promise<void>((ok) => server.listen(options.port ?? 0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    url: (path = '/') => new URL(path.replace(/^\/?/, '/'), origin).href,
    close: () => new Promise<void>((ok, fail) => server.close((err) => (err ? fail(err) : ok()))),
  };
}
