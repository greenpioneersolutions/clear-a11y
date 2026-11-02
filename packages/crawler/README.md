# @clear-a11y/crawler

URL discovery for [Clear A11Y](https://github.com/greenpioneersolutions/clear-a11y). Breadth-first from the targets you list, limited to their origins by default, with include/exclude patterns and a page limit. It never crawls beyond what you asked for.

## Install

```sh
npm install @clear-a11y/crawler
npx playwright install chromium   # the browser it drives
```

## Usage

```ts
import { crawl, browserLinkSource } from '@clear-a11y/crawler';

const urls = await crawl(
  {
    start: ['http://localhost:3000/'],
    maxPages: 20,
    sameOrigin: true,
    include: [],
    exclude: ['/admin/*'],
  },
  browserLinkSource(session),
);
```

## Documentation

- Docs site: https://greenpioneersolutions.github.io/clear-a11y/ (CLI guide, configuration reference)
- Source: https://github.com/greenpioneersolutions/clear-a11y/tree/main/packages/crawler
