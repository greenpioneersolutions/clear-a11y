import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Finding } from '@clear-a11y/core';
import {
  expectFinding,
  expectNoFinding,
  fixtureHarness,
  fixturesExpectedDir,
} from '@clear-a11y/test-utils';
import { createWidgetsEngine } from '../src/index.js';

const harness = fixtureHarness();
afterAll(() => harness.close());

const scan = async (path: string, state?: string): Promise<Finding[]> => {
  const fx = await harness.open(path, state ? { state, stateMeta: { kind: state } } : {});
  try {
    return await createWidgetsEngine().run(fx.ctx);
  } finally {
    await fx.close();
  }
};

/** Every page of the fixture site with its expected file, so we can check all ok pages. */
function expectedPages(): Array<{ page: string; correctPattern: boolean }> {
  const out: Array<{ page: string; correctPattern: boolean }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) {
        const json = JSON.parse(readFileSync(full, 'utf-8')) as {
          page: string;
          correctPattern: boolean;
        };
        out.push({ page: json.page, correctPattern: json.correctPattern });
      }
    }
  };
  walk(fixturesExpectedDir());
  return out.sort((a, b) => relative('', a.page).localeCompare(b.page));
}

describe('engine-widgets (integration)', () => {
  it('reports nothing on the blank fixture page', async () => {
    expect(await scan('blank.html')).toEqual([]);
  });

  it('only runs in the default state', async () => {
    expect(await scan('widgets/tabs-no-arrow-keys.html', 'form-invalid')).toEqual([]);
  });

  describe('widgets/tabs-keyboard', () => {
    it('finds inactive tabs that keyboards cannot reach (S00c seed)', async () => {
      const f = expectFinding(await scan('widgets/tabs-no-arrow-keys.html'), {
        ruleId: 'widgets/tabs-keyboard',
        wcag: '2.1.1',
        selector: '#tab-2',
      });
      expect(f.tier).toBe('violation');
      expect(f.message).toContain('#tab-3');
      expect(f.evidence.focusPath?.[0]?.selector).toBe('#tab-1');
    });

    it('finds a tab list with no focusable tab', async () => {
      const f = expectFinding(await scan('widgets/tabs-keyboard.html'), {
        ruleId: 'widgets/tabs-keyboard',
        selector: '#plan-tabs',
      });
      expect(f.tier).toBe('violation');
    });

    it('accepts vertical tabs with Up/Down Arrow', async () => {
      expect(await scan('widgets/tabs-keyboard-ok.html')).toEqual([]);
    });
  });

  describe('widgets/tabs-selected-state', () => {
    it('finds aria-selected that does not follow the shown panel', async () => {
      const findings = await scan('widgets/tabs-selected-state.html');
      const f = expectFinding(findings, {
        ruleId: 'widgets/tabs-selected-state',
        selector: '#tab-shipping',
      });
      expect(f.tier).toBe('violation');
      expect(f.wcag).toEqual(['4.1.2']);
      expectNoFinding(findings, { ruleId: 'widgets/tabs-keyboard' });
    });

    it('accepts manual activation', async () => {
      expect(await scan('widgets/tabs-selected-state-ok.html')).toEqual([]);
    });
  });

  describe('widgets/menu-keyboard', () => {
    it('finds menu items the keyboard cannot reach', async () => {
      const f = expectFinding(await scan('widgets/menu-keyboard.html'), {
        ruleId: 'widgets/menu-keyboard',
        selector: '#actions-button',
      });
      expect(f.tier).toBe('violation');
      expect(f.wcag).toEqual(['2.1.1']);
      expect(f.message).toContain('#action-track');
    });

    it('accepts the APG actions menu button', async () => {
      expect(await scan('widgets/menu-keyboard-ok.html')).toEqual([]);
    });
  });

  describe('widgets/combobox-keyboard', () => {
    it('finds a combobox whose state is only visual', async () => {
      const f = expectFinding(await scan('widgets/combobox-keyboard.html'), {
        ruleId: 'widgets/combobox-keyboard',
        selector: '#country-combobox',
      });
      expect(f.tier).toBe('violation');
      expect(f.wcag).toEqual(['4.1.2']);
      expect(f.message).toMatch(/aria-expanded/);
      expect(f.message).toMatch(/only visually/);
    });

    it('accepts the APG list autocomplete combobox', async () => {
      expect(await scan('widgets/combobox-keyboard-ok.html')).toEqual([]);
    });
  });

  describe('widgets/listbox-keyboard', () => {
    it('finds a listbox whose active option is only visual', async () => {
      const f = expectFinding(await scan('widgets/listbox-keyboard.html'), {
        ruleId: 'widgets/listbox-keyboard',
        selector: '#size-list',
      });
      expect(f.tier).toBe('violation');
      expect(f.wcag).toEqual(['4.1.2']);
    });

    it('accepts the APG single-select listbox', async () => {
      expect(await scan('widgets/listbox-keyboard-ok.html')).toEqual([]);
    });
  });

  describe('widgets/dialog-initial-focus', () => {
    it('finds a dialog that does not take focus and a dialog without a name', async () => {
      const findings = await scan('widgets/dialog-initial-focus.html');
      const focus = expectFinding(findings, {
        ruleId: 'widgets/dialog-initial-focus',
        selector: '#filters-dialog',
      });
      expect(focus).toMatchObject({ tier: 'likely', wcag: ['2.4.3'] });
      const name = expectFinding(findings, {
        ruleId: 'widgets/dialog-initial-focus',
        selector: '#share-dialog',
      });
      expect(name).toMatchObject({ tier: 'violation', wcag: ['4.1.2'] });
    });

    it('finds the unlinked settings dialog by probing its opener', async () => {
      expectFinding(await scan('states/modal-focus.html'), {
        ruleId: 'widgets/dialog-initial-focus',
        wcag: '2.4.3',
        selector: '#settings-dialog',
      });
    });

    it('accepts the APG modal dialog', async () => {
      expect(await scan('widgets/dialog-initial-focus-ok.html')).toEqual([]);
    });
  });

  describe('widgets/disclosure-keyboard', () => {
    it('finds a click-only toggle and a stale aria-expanded', async () => {
      const findings = await scan('widgets/disclosure-keyboard.html');
      expect(
        expectFinding(findings, {
          ruleId: 'widgets/disclosure-keyboard',
          selector: '#returns-toggle',
        }),
      ).toMatchObject({ tier: 'violation', wcag: ['2.1.1'] });
      expect(
        expectFinding(findings, {
          ruleId: 'widgets/disclosure-keyboard',
          selector: '#warranty-toggle',
        }),
      ).toMatchObject({ tier: 'violation', wcag: ['4.1.2'] });
    });

    it('accepts the APG FAQ disclosures', async () => {
      expect(await scan('widgets/disclosure-keyboard-ok.html')).toEqual([]);
    });
  });

  describe('widgets/grid-keyboard', () => {
    it('finds grid cells the keyboard cannot reach', async () => {
      const f = expectFinding(await scan('widgets/grid-keyboard.html'), {
        ruleId: 'widgets/grid-keyboard',
        selector: '#june-grid',
      });
      expect(f.tier).toBe('violation');
    });

    it('accepts the APG grid with arrow keys', async () => {
      expect(await scan('widgets/grid-keyboard-ok.html')).toEqual([]);
    });
  });

  it('reports nothing (any tier) on every correct-pattern page', async () => {
    const okPages = expectedPages().filter((p) => p.correctPattern);
    expect(okPages.length).toBeGreaterThan(10);
    for (const { page } of okPages) {
      const findings = await scan(page);
      expect({ page, findings: findings.map((f) => `${f.ruleId} ${f.target.selector}`) }).toEqual({
        page,
        findings: [],
      });
    }
  }, 180_000);

  it('raises no violation on barrier pages of other layers that it does not expect', async () => {
    const others = expectedPages().filter(
      (p) => !p.correctPattern && !p.page.startsWith('widgets/'),
    );
    for (const { page } of others) {
      // A violation is fine when it matches an issue a human auditor logged for that page.
      const issues = (
        JSON.parse(
          readFileSync(join(fixturesExpectedDir(), page.replace(/\.html$/, '.json')), 'utf-8'),
        ) as { issues: Array<{ wcag: string[]; selector: string }> }
      ).issues;
      const violations = (await scan(page)).filter(
        (f) =>
          f.tier === 'violation' &&
          !issues.some(
            (i) =>
              i.wcag.some((sc) => f.wcag.includes(sc)) &&
              i.selector.split(' | ').includes(f.target.selector),
          ),
      );
      expect({
        page,
        violations: violations.map((f) => `${f.ruleId} ${f.target.selector}`),
      }).toEqual({ page, violations: [] });
    }
  }, 180_000);
});
