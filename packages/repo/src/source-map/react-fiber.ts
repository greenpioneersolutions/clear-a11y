/** Where React says an element was created (dev builds only). */
export interface ReactDebugSource {
  fileName: string;
  lineNumber: number;
  columnNumber?: number;
  /**
   * True when it came from React 19's `_debugStack` (a stack trace of the compiled module, so the
   * line can be off); false for React <= 18's exact `_debugSource`.
   */
  fromStack: boolean;
}

/**
 * Runs IN THE PAGE (pass it to Playwright's `locator.evaluate`): reads the React fiber attached to
 * a DOM element in a development build and returns where the element was written.
 * React <= 18: `fiber._debugSource` ({ fileName, lineNumber, columnNumber }), exact.
 * React 19 removed it; `_debugStack` (an Error) is parsed instead and marked `fromStack`.
 * Self-contained on purpose (Playwright serializes it). Returns null in production builds.
 */
export function reactDebugSourceProbe(el: Element): ReactDebugSource | null {
  type Fiber = {
    _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number };
    _debugStack?: { stack?: string };
    _debugOwner?: Fiber | null;
    return?: Fiber | null;
  };
  const host = el as unknown as Record<string, unknown>;
  const key = Object.keys(host).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
  );
  if (!key) return null;
  for (let f = host[key] as Fiber | null | undefined, i = 0; f && i < 50; f = f.return, i++) {
    const s = f._debugSource;
    if (s && typeof s.fileName === 'string' && typeof s.lineNumber === 'number')
      return {
        fileName: s.fileName,
        lineNumber: s.lineNumber,
        ...(typeof s.columnNumber === 'number' ? { columnNumber: s.columnNumber } : {}),
        fromStack: false,
      };
    const stack = f._debugStack?.stack;
    if (typeof stack === 'string') {
      for (const line of stack.split('\n').slice(1)) {
        if (/node_modules|react-dom|react\.development|jsx-dev-runtime|jsx-runtime/.test(line))
          continue;
        const m = /\(?((?:https?|file|webpack-internal):\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/.exec(
          line,
        );
        if (m && m[1])
          return {
            fileName: m[1],
            lineNumber: Number(m[2]),
            columnNumber: Number(m[3]),
            fromStack: true,
          };
      }
    }
  }
  return null;
}

/**
 * Repo-relative path for a file name React reported: an absolute path, a dev-server URL
 * ("http://localhost:5173/src/App.tsx?t=1") or "webpack-internal:///./src/App.tsx".
 */
export function fileFromReactSource(fileName: string): string {
  let f = fileName.replace(/^webpack-internal:\/\/\/(\([^)]*\)\/)?/, '');
  if (/^(https?|file):\/\//.test(f)) {
    try {
      f = decodeURIComponent(new URL(f).pathname);
    } catch {
      /* keep as-is */
    }
  }
  return f.replace(/[?#].*$/, '');
}
