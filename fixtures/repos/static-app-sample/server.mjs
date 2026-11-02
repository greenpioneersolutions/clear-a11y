// Dev server of the static-app-sample fixture: node:http only, no dependencies.
// `node server.mjs --port 0` listens on a free port on 127.0.0.1 and prints its URL the way
// framework dev servers do ("Local: http://127.0.0.1:<port>/"). Without --port it uses $PORT.
import { createServer } from 'node:http';

const arg = process.argv.indexOf('--port');
const port = Number(arg > 0 ? process.argv[arg + 1] : (process.env.PORT ?? 0));

const layout = (title, body) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font: 16px/1.5 system-ui, sans-serif; color: #1a1a1a; background: #fff; }
      a { color: #1a5fb4; }
      :focus-visible { outline: 3px solid #1a5fb4; outline-offset: 2px; }
    </style>
  </head>
  <body>
    <header><nav aria-label="Main"><a href="/">Home</a> <a href="/form">Contact</a></nav></header>
    <main>${body}</main>
  </body>
</html>`;

const PAGES = {
  // Seeded barrier: an icon link with no accessible name (2.4.4, 4.1.2).
  '/': layout(
    'Sample shop',
    `<h1>Sample shop</h1>
      <p>Trail running shoes and more.</p>
      <p><a href="/cart" id="cart-link"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="currentColor"></circle></svg></a></p>`,
  ),
  // Seeded barrier: a text input with no label (1.3.1, 4.1.2).
  '/form': layout(
    'Contact us',
    `<h1>Contact us</h1>
      <form action="/form" method="get">
        <p>Your email</p>
        <input type="email" id="contact-email" name="email" />
        <p><button type="submit">Send</button></p>
      </form>`,
  ),
  '/cart': layout('Cart', '<h1>Cart</h1><p>Your cart is empty.</p>'),
};

const server = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  const page = PAGES[path];
  res.writeHead(page ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page ?? layout('Not found', '<h1>Not found</h1>'));
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(`\x1b[32m  ➜  Local:\x1b[0m   http://127.0.0.1:${address.port}/`);
});
