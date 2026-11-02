import {
  altTextSuspicion,
  altTextSuspiciousRule,
  detectAltTextSuspicious,
} from './alt-text-suspicious.js';

describe('at/alt-text-suspicious', () => {
  it('has rule metadata', () => {
    expect(altTextSuspiciousRule.id).toBe('at/alt-text-suspicious');
    expect(altTextSuspiciousRule.wcag).toEqual(['1.1.1']);
    expect(altTextSuspiciousRule.tier).toBe('likely');
  });

  it('detects file names, URLs and placeholder words', () => {
    expect(altTextSuspicion({ alt: 'IMG_2041.jpg' })).toBe('file-name');
    expect(altTextSuspicion({ alt: 'DSC01234' })).toBe('file-name');
    expect(altTextSuspicion({ alt: 'hero-banner_v2', src: '/img/hero-banner_v2.webp' })).toBe(
      'file-name',
    );
    expect(altTextSuspicion({ alt: 'https://cdn.example.com/a.png' })).toBe('url');
    expect(altTextSuspicion({ alt: 'www.example.com/team' })).toBe('url');
    for (const alt of [
      'image',
      'Photo',
      'picture 3',
      'graphic',
      'spacer',
      'Logo',
      'img1',
      'untitled',
    ]) {
      expect(altTextSuspicion({ alt }), alt).toBe('placeholder');
    }
  });

  it('does not flag the correct pattern', () => {
    for (const alt of [
      'Five team members standing in front of the Ghent office',
      'Blue trail running shoe, side view',
      'Acme Corporation',
      'Photo of the river at dusk',
      'Chart: sales doubled in 2025',
      'Team',
    ]) {
      expect(detectAltTextSuspicious({ alt, src: '/img/team-2025.jpg' }), alt).toBe(false);
    }
    expect(detectAltTextSuspicious({ alt: '' })).toBe(false);
    // A one-word name that happens to equal a plain file stem is not flagged.
    expect(detectAltTextSuspicious({ alt: 'Team', src: '/team.jpg' })).toBe(false);
  });
});
