import { getCdpSession, type CDPSession, type Page } from '@clear-a11y/browser';
import type { RawAxNode } from './ax-tree.js';

const GROUP = 'clear-a11y-at';

/** Thin wrapper over a CDP session: AX tree, DOM node resolution and in-page calls. */
export class Cdp {
  private constructor(private readonly session: CDPSession) {}

  static async open(page: Page): Promise<Cdp> {
    const session = await getCdpSession(page);
    await session.send('DOM.enable');
    await session.send('DOM.getDocument', { depth: 0 });
    return new Cdp(session);
  }

  async fullAxTree(): Promise<RawAxNode[]> {
    const { nodes } = await this.session.send('Accessibility.getFullAXTree');
    return nodes as unknown as RawAxNode[];
  }

  /** Remote object id of a DOM node from its backend id, or undefined when it's gone. */
  async resolve(backendNodeId: number): Promise<string | undefined> {
    try {
      const { object } = await this.session.send('DOM.resolveNode', {
        backendNodeId,
        objectGroup: GROUP,
      });
      return object.objectId;
    } catch {
      return undefined;
    }
  }

  /** Elements returned by an in-page expression that evaluates to an array of elements. */
  async elements(expression: string): Promise<Array<{ objectId: string; backendNodeId: number }>> {
    const { result } = await this.session.send('Runtime.evaluate', {
      expression,
      objectGroup: GROUP,
    });
    if (!result.objectId) return [];
    const { result: props } = await this.session.send('Runtime.getProperties', {
      objectId: result.objectId,
      ownProperties: true,
    });
    const out: Array<{ objectId: string; backendNodeId: number }> = [];
    for (const p of props) {
      if (!/^\d+$/.test(p.name) || !p.value?.objectId) continue;
      const { node } = await this.session.send('DOM.describeNode', { objectId: p.value.objectId });
      out.push({ objectId: p.value.objectId, backendNodeId: node.backendNodeId });
    }
    return out;
  }

  /**
   * Calls a self-contained function in the page with `this` bound to the remote object and
   * returns its JSON result.
   */
  async call<T>(objectId: string, fn: (this: Element) => T): Promise<T | undefined> {
    try {
      const { result } = await this.session.send('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration: fn.toString(),
        returnByValue: true,
      });
      return result.value as T;
    } catch {
      return undefined;
    }
  }

  /** Event listener types attached directly to the element (including inline `on*` handlers). */
  async listenerTypes(objectId: string): Promise<string[]> {
    try {
      const { listeners } = await this.session.send('DOMDebugger.getEventListeners', { objectId });
      return [...new Set(listeners.map((l) => l.type))];
    } catch {
      return [];
    }
  }

  async close(): Promise<void> {
    // Best effort: the page may already be closed.
    await this.session
      .send('Runtime.releaseObjectGroup', { objectGroup: GROUP })
      .catch(() => undefined);
    await this.session.detach().catch(() => undefined);
  }
}
