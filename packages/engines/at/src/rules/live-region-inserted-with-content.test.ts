import {
  detectLiveRegionInsertedWithContent,
  liveRegionInsertedWithContentRule,
} from './live-region-inserted-with-content.js';

describe('at/live-region-inserted-with-content', () => {
  it('has rule metadata', () => {
    expect(liveRegionInsertedWithContentRule.id).toBe('at/live-region-inserted-with-content');
    expect(liveRegionInsertedWithContentRule.wcag).toEqual(['4.1.3']);
  });

  it('detects regions inserted with readable text, once per selector', () => {
    const region = { selector: '#saved', text: 'Draft saved', politeness: 'polite' as const };
    expect(detectLiveRegionInsertedWithContent([region, region])).toEqual([region]);
  });

  it('does not flag the correct pattern (nothing inserted, or no readable text)', () => {
    expect(detectLiveRegionInsertedWithContent([])).toEqual([]);
    expect(
      detectLiveRegionInsertedWithContent([{ selector: '#x', text: '…', politeness: 'polite' }]),
    ).toEqual([]);
  });
});
