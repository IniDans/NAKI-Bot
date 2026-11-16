/**
 * Pure message checks for the newer AutoMod rules. No Discord objects here so they can be unit tested.
 */

const OFFICIAL_DOMAINS = [
  'discord.com',
  'discord.gg',
  'discord.gift',
  'discord.media',
  'discord.new',
  'discord.dev',
  'discord.co',
  'discord.store',
  'discordapp.com',
  'discordapp.net',
  'discordstatus.com',
  'dis.gd',
  'steamcommunity.com',
  'steampowered.com',
  'steamstatic.com',
  'steamgames.com',
  'steamdeck.com',
  'steamchina.com',
  's.team',
  'valvesoftware.com',
];

// Brand names scammers imitate in look-alike domains.
const BRANDS = ['discord', 'discordapp', 'steamcommunity', 'steampowered'];
// "nitro" alone is too common (nitropdf, nitrotype); only flag it next to bait words.
const NITRO_BAIT = /(free|gift|claim|get)nitro|nitro(gift|free|claim)/;

const SCAM_PHRASES = [
  /free\s+(discord\s+)?nitro/i,
  /nitro\s+(for\s+)?free/i,
  /steam\s+gift\s*card/i,
  /gift(ing)?\s+(away\s+)?\d+\s*\$?\s*(steam|nitro)/i,
  /\b(airdrop|giveaway)\b.*\b(nitro|steam)\b/i,
];

const LEET: Record<string, string> = { '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

export function hostsIn(content: string): string[] {
  return [...content.matchAll(/https?:\/\/([^\s/?#<>]+)/gi)].map((m) => m[1].toLowerCase().replace(/:\d+$/, ''));
}

function isOfficial(host: string): boolean {
  return OFFICIAL_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** True when a host imitates Discord or Steam without being one of their real domains. */
export function isLookalikeHost(host: string): boolean {
  if (isOfficial(host)) return false;
  const labels = host.split('.').slice(0, -1);
  return labels.some((label) => {
    const plain = [...label].map((c) => LEET[c] ?? c).join('');
    const squashed = plain.replace(/[-_]/g, '');
    if (BRANDS.some((brand) => squashed.includes(brand)) || NITRO_BAIT.test(squashed)) return true;
    // One typo for short brands ("dlscord"), two for long ones ("steamcomunlty").
    return plain
      .split(/[-_]/)
      .some((part) => BRANDS.some((brand) => part.length >= 5 && editDistance(part, brand) <= (brand.length >= 10 ? 2 : 1)));
  });
}

/** Returns the reason a message looks like phishing, or null. */
export function phishingReason(content: string, extraDomains: string[] = []): string | null {
  const hosts = hostsIn(content);
  if (hosts.length === 0) return null;
  const extra = extraDomains.map((d) => d.toLowerCase());
  const listed = hosts.find((h) => extra.some((d) => h === d || h.endsWith(`.${d}`)));
  if (listed) return `blocked domain ${listed}`;
  const lookalike = hosts.find(isLookalikeHost);
  if (lookalike) return `look-alike domain ${lookalike}`;
  if (hosts.some((h) => !isOfficial(h)) && SCAM_PHRASES.some((re) => re.test(content))) return 'scam text with a link';
  return null;
}

const INVITE_RE = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg|dsc\.gg)\/([a-z0-9-]{2,32})/gi;

export function inviteCodes(content: string): string[] {
  return [...new Set([...content.matchAll(INVITE_RE)].map((m) => m[1]))];
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Counts custom emoji plus unicode emoji, treating a ZWJ family or flag as one. */
export function countEmojis(content: string): number {
  const custom = content.match(/<a?:\w{2,32}:\d{17,20}>/g) ?? [];
  const rest = content.replace(/<a?:\w{2,32}:\d{17,20}>/g, ' ');
  let unicode = 0;
  for (const { segment } of segmenter.segment(rest)) {
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(segment)) unicode++;
  }
  return custom.length + unicode;
}

/**
 * Zalgo text stacks many combining marks on one letter. Real scripts (Vietnamese, Thai, Devanagari)
 * use at most two or three per letter after NFC, so a run of `maxStack`+ marks is a safe signal.
 */
export function isZalgo(content: string, maxStack = 4): boolean {
  const stack = Math.max(2, Math.min(maxStack, 20));
  return new RegExp(`\\p{M}{${stack},}`, 'u').test(content.normalize('NFC'));
}
