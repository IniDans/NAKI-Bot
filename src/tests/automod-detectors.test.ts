import { describe, expect, it } from 'vitest';
import { countEmojis, inviteCodes, isLookalikeHost, isZalgo, phishingReason } from '../modules/automod/detectors.js';
import { buildNativeRule } from '../modules/automod/native-rule.js';

describe('phishing detection', () => {
  it('leaves official Discord and Steam links alone', () => {
    for (const host of ['discord.com', 'cdn.discordapp.com', 'discord.gift', 'store.steampowered.com', 'steamcommunity.com']) {
      expect(isLookalikeHost(host)).toBe(false);
    }
    expect(phishingReason('free nitro at https://discord.gift/abc')).toBeNull();
  });

  it('flags look-alike domains', () => {
    for (const host of ['dlscord.gift', 'discord-nitro.ru', 'steamcommunlty.com', 'disc0rdapp.co', 'free-nitro.xyz', 'discordd.com']) {
      expect(isLookalikeHost(host), host).toBe(true);
    }
  });

  it('does not flag unrelated sites', () => {
    for (const host of ['github.com', 'youtube.com', 'discourse.org', 'discos.id', 'steam-engine.org', 'nitropdf.com']) {
      expect(isLookalikeHost(host), host).toBe(false);
    }
  });

  it('flags scam text with any outside link and custom domains', () => {
    expect(phishingReason('Free Nitro for everyone https://bit.ly/x')).toBe('scam text with a link');
    expect(phishingReason('look https://evil.example/a', ['evil.example'])).toBe('blocked domain evil.example');
    expect(phishingReason('free nitro, no link')).toBeNull();
  });
});

describe('invites, emoji and zalgo', () => {
  it('extracts invite codes once each', () => {
    expect(inviteCodes('join discord.gg/abc and https://discord.com/invite/abc or discordapp.com/invite/XyZ-1')).toEqual([
      'abc',
      'XyZ-1',
    ]);
  });

  it('counts emoji as people see them', () => {
    expect(countEmojis('hi')).toBe(0);
    expect(countEmojis('😀😀 <:pog:123456789012345678> <a:wave:123456789012345678>')).toBe(4);
    expect(countEmojis('👨‍👩‍👧 🇮🇩')).toBe(2);
  });

  it('catches stacked marks but not normal accented scripts', () => {
    expect(isZalgo('h̵̛̖̪̙e̸̢͓͕l̷̰̈́͝l̶͎̏o')).toBe(true);
    expect(isZalgo('Tiếng Việt có dấu')).toBe(false);
    expect(isZalgo('สวัสดีครับ')).toBe(false);
    expect(isZalgo('नमस्ते दुनिया')).toBe(false);
  });
});

describe('native AutoMod rule', () => {
  it('maps word lists to Discord keyword syntax and caps lengths', () => {
    const rule = buildNativeRule([
      { config: { match: 'contains', words: ['Bad', 'x'.repeat(80)] } },
      { config: { match: 'exact', words: ['worse', 'bad'] } },
      { config: { match: 'regex', pattern: 'fr+ee\\s*nitro' } },
    ]);
    expect(rule.keywordFilter).toEqual(['*bad*', 'worse', 'bad']);
    expect(rule.regexPatterns).toEqual(['fr+ee\\s*nitro']);
  });

  it('is empty when there is nothing to sync', () => {
    expect(buildNativeRule([])).toEqual({ keywordFilter: [], regexPatterns: [], exemptRoles: [], exemptChannels: [] });
  });
});
