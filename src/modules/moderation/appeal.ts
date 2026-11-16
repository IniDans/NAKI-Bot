import { env } from '../../config/env.js';
import { modConfigService } from '../../services/database/modconfig.service.js';

/** Public appeal page for a guild, or null when appeals are off or no dashboard URL is configured. */
export async function appealUrl(guildId: string): Promise<string | null> {
  if (!env.DASHBOARD_URL) return null;
  const config = await modConfigService.get(guildId).catch(() => null);
  return config?.appealsEnabled && config.appealChannelId ? `${env.DASHBOARD_URL}/appeal/${guildId}` : null;
}
