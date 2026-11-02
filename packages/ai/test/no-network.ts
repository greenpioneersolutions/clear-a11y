// Network guard for every test in this package: a request that would leave localhost fails the
// test instead of reaching a real AI provider. Providers in tests get a stubbed fetch anyway.
const realFetch = globalThis.fetch;
const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const { hostname, origin } = new URL(href);
  if (!LOCAL.has(hostname)) {
    return Promise.reject(new Error(`network access is blocked in tests (${origin})`));
  }
  return realFetch(input, init);
};
