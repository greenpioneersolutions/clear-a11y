import { ensureHelpers, type Page, type PageContext } from '@clear-a11y/browser';

/**
 * Runs in the page: selector of the focused element (through open shadow roots), or null.
 * With `virtual`, an element that points at an existing aria-activedescendant reports that
 * descendant instead (virtual focus, as screen readers follow it).
 */
function readFocused(virtual: boolean): string | null {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  if (virtual) {
    const id = el.getAttribute('aria-activedescendant');
    const active = id ? document.getElementById(id) : null;
    if (active) el = active;
  }
  return window.__clearA11y!.selector(el);
}

/**
 * Keyboard and page I/O for contract scripts. Every script starts with `fresh()`, which reloads
 * the page (and replays the state) only when an earlier script touched it.
 */
export class Driver {
  private dirty = false;
  constructor(
    readonly ctx: PageContext,
    private readonly settleMs = 60,
  ) {}

  get page(): Page {
    return this.ctx.page;
  }

  async fresh(): Promise<void> {
    if (!this.dirty) {
      await ensureHelpers(this.page);
      return;
    }
    await this.page.goto(this.ctx.url, { waitUntil: 'load', timeout: this.ctx.config.timeoutMs });
    if (this.ctx.stateMeta?.replay) await this.ctx.stateMeta.replay(this.page);
    await ensureHelpers(this.page);
    this.dirty = false;
  }

  /**
   * Waits for the page to react. Throws when the action navigated to another document (a link
   * or form submit): the script's observations would describe a different page.
   */
  async settle(): Promise<void> {
    await this.page.waitForTimeout(this.settleMs);
    const strip = (u: string) => u.replace(/#.*$/, '');
    if (strip(this.page.url()) !== strip(this.ctx.url)) {
      this.dirty = true;
      throw new Error(`navigated away to ${this.page.url()}`);
    }
  }

  /** Moves focus with element.focus(), as if the user had tabbed to a tabbable element. */
  async focus(selector: string): Promise<void> {
    this.dirty = true;
    await this.page
      .locator(selector)
      .first()
      .evaluate((el) => (el as HTMLElement).focus())
      .catch(() => undefined);
    await this.settle();
  }

  /** Presses a key on the focused element; returns the (virtual) focus afterwards. */
  async press(key: string): Promise<string | null> {
    this.dirty = true;
    await this.page.keyboard.press(key);
    await this.settle();
    return this.focused(true);
  }

  async type(text: string): Promise<void> {
    this.dirty = true;
    await this.page.keyboard.type(text);
    await this.settle();
  }

  /** A real mouse click, used only to confirm that a widget works at all. */
  async click(selector: string): Promise<boolean> {
    this.dirty = true;
    try {
      await this.page.locator(selector).first().click({ timeout: 1_500 });
    } catch {
      return false;
    }
    await this.settle();
    return true;
  }

  async focused(virtual = false): Promise<string | null> {
    await ensureHelpers(this.page);
    return this.page.evaluate(readFocused, virtual);
  }

  /** Runs an in-page function after making sure the helpers exist. */
  async evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R> {
    await ensureHelpers(this.page);
    // Our args are plain JSON (strings, arrays, objects), so Playwright's Unboxed<A> is A;
    // TypeScript cannot prove that for a generic A.
    return this.page.evaluate(fn as (arg: unknown) => R, arg);
  }
}
