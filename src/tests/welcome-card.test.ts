import { describe, expect, it } from 'vitest';
import { DEFAULT_CARD_ACCENT, fitText, ordinal, parseAccent, renderWelcomeCard } from '../modules/welcome/card.js';

describe('parseAccent', () => {
  it('accepts long and short hex colours', () => {
    expect(parseAccent('#43B581')).toBe('#43b581');
    expect(parseAccent('#fa0')).toBe('#ffaa00');
  });
  it('falls back to the default for anything else', () => {
    expect(parseAccent(null)).toBe(DEFAULT_CARD_ACCENT);
    expect(parseAccent('red')).toBe(DEFAULT_CARD_ACCENT);
    expect(parseAccent('#12345')).toBe(DEFAULT_CARD_ACCENT);
  });
});

describe('fitText', () => {
  const measure = (s: string) => [...s].length * 10;
  it('keeps text that fits', () => {
    expect(fitText('short', 100, measure)).toBe('short');
  });
  it('cuts long text with an ellipsis', () => {
    expect(fitText('a very long name', 60, measure)).toBe('a ver…');
  });
});

describe('ordinal', () => {
  it('uses the right suffix', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 102, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '102nd',
      '111th',
    ]);
  });
});

describe('renderWelcomeCard', () => {
  it('renders a PNG without an avatar', async () => {
    const png = await renderWelcomeCard({
      displayName: 'Someone',
      username: 'someone',
      serverName: 'Test Server',
      memberCount: 42,
      avatar: null,
    });
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });
});
