// Correct pattern: the document shell declares its language.
import type { ReactNode } from 'react';

export function DocumentOk({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Sample shop</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
