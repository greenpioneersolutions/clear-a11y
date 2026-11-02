import { escapeHtml, linkOrText, safeHttpUrl } from './escape.js';

describe('escapeHtml', () => {
  it.each([
    ['<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    ['"><img src=x onerror=alert(1)>', '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'],
    ["' onfocus='x", '&#39; onfocus=&#39;x'],
    ['</style>', '&lt;/style&gt;'],
    ['a & b `c`', 'a &amp; b &#96;c&#96;'],
  ])('escapes %s', (input, out) => {
    expect(escapeHtml(input)).toBe(out);
  });

  it('handles non-strings', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(3)).toBe('3');
  });
});

describe('safe links', () => {
  it('only links http(s) URLs', () => {
    expect(safeHttpUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl('data:text/html,<script>')).toBeUndefined();
    expect(safeHttpUrl('file:///etc/passwd')).toBeUndefined();
    expect(safeHttpUrl('not a url')).toBeUndefined();
  });

  it('renders non-http URLs as escaped text', () => {
    expect(linkOrText('javascript:alert("x")')).toBe('javascript:alert(&quot;x&quot;)');
    expect(linkOrText('http://a.test/"x"')).toBe(
      '<a href="http://a.test/%22x%22">http://a.test/&quot;x&quot;</a>',
    );
  });
});
