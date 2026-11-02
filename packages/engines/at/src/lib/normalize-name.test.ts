import { hasReadableText, nameContainsLabel, normalizeName } from './normalize-name.js';

describe('normalizeName', () => {
  it('ignores case, whitespace and punctuation', () => {
    expect(normalizeName('  Search,   Products! ')).toBe('search products');
    expect(normalizeName('Add to cart →')).toBe('add to cart');
  });
});

describe('nameContainsLabel', () => {
  it('matches whole words in any position', () => {
    expect(nameContainsLabel('Search products', 'Search')).toBe(true);
    expect(nameContainsLabel('Go to search', 'search')).toBe(true);
    expect(nameContainsLabel('Find products', 'Search')).toBe(false);
    // "Sea" is not a whole-word match inside "Search".
    expect(nameContainsLabel('Search', 'Sea')).toBe(false);
  });

  it('treats an empty label as contained', () => {
    expect(nameContainsLabel('Close', '')).toBe(true);
  });
});

describe('hasReadableText', () => {
  it('needs a letter or a digit', () => {
    expect(hasReadableText('…')).toBe(false);
    expect(hasReadableText('3')).toBe(true);
  });
});
