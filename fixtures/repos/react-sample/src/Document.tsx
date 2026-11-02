// Seeded barrier: server-rendered document shell without a page language.
import type { ReactNode } from 'react';

export function Document({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <title>Sample shop</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
