// Serves fixtures/site on http://127.0.0.1:<port> (default 4173). Local only.
// Usage: pnpm nx run fixtures:serve [-- --port=5000]
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../site', import.meta.url)));
const portArg = process.argv.find((a) => a.startsWith('--port='));
const port = Number(portArg?.split('=')[1] ?? process.env.PORT ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = resolve(root, '.' + normalize('/' + path));
  if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end('Forbidden');
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    statSync(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Fixtures at http://127.0.0.1:${port}/`));
