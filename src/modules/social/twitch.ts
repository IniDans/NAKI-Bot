import { env } from '../../config/env.js';

export interface TwitchStream {
  id: string;
  user_login: string;
  user_name: string;
  game_name: string;
  title: string;
}

let token: { value: string; expiresAt: number } | null = null;

export function twitchEnabled(): boolean {
  return Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET);
}

async function appToken(force = false): Promise<string> {
  if (!force && token && token.expiresAt > Date.now() + 60_000) return token.value;
  const params = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID ?? '',
    client_secret: env.TWITCH_CLIENT_SECRET ?? '',
    grant_type: 'client_credentials',
  });
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: params,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Twitch token request failed (${res.status})`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return token.value;
}

/** Live streams for the given logins, keyed by lowercase login. Offline channels are absent. */
export async function fetchLiveStreams(logins: string[]): Promise<Map<string, TwitchStream>> {
  const live = new Map<string, TwitchStream>();
  for (let i = 0; i < logins.length; i += 100) {
    const query = new URLSearchParams(logins.slice(i, i + 100).map((login): [string, string] => ['user_login', login]));
    query.set('first', '100');
    let res: Response | null = null;
    // A 401 means the cached app token expired early; fetch a new one and retry once.
    for (const force of [false, true]) {
      res = await fetch(`https://api.twitch.tv/helix/streams?${query}`, {
        headers: { 'Client-Id': env.TWITCH_CLIENT_ID ?? '', Authorization: `Bearer ${await appToken(force)}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status !== 401) break;
    }
    if (!res?.ok) throw new Error(`Twitch streams request failed (${res?.status})`);
    const body = (await res.json()) as { data: TwitchStream[] };
    for (const stream of body.data) live.set(stream.user_login.toLowerCase(), stream);
  }
  return live;
}
