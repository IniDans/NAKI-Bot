import { AttachmentBuilder, EmbedBuilder, GuildMember, TextChannel, type MessageCreateOptions } from 'discord.js';
import { guildService } from '../../services/database/guild.service.js';
import { renderPlaceholders } from '../../utils/placeholders.js';
import { appLogger } from '../../utils/logger.js';
import { Colors } from '../../config/constants.js';
import { fetchAvatar, renderWelcomeCard } from './card.js';

export const DEFAULT_WELCOME_MESSAGE = 'Welcome {mention} to **{server}**! You are member #{membercount}.';

export function buildWelcomeContent(member: GuildMember, template = DEFAULT_WELCOME_MESSAGE): string {
  return renderPlaceholders(template, {
    userId: member.id,
    username: member.user.username,
    displayName: member.displayName,
    mention: `<@${member.id}>`,
    serverName: member.guild.name,
    memberCount: member.guild.memberCount,
  });
}

type WelcomeConfig = Awaited<ReturnType<typeof guildService.getWelcomeConfig>>;
const CARD_NAME = 'welcome.png';

async function buildCard(member: GuildMember, accent: string | null): Promise<AttachmentBuilder | null> {
  try {
    const avatar = await fetchAvatar(member.displayAvatarURL({ extension: 'png', size: 256 }));
    const png = await renderWelcomeCard({
      displayName: member.displayName,
      username: member.user.username,
      serverName: member.guild.name,
      memberCount: member.guild.memberCount,
      avatar,
      accent,
    });
    return new AttachmentBuilder(png, { name: CARD_NAME });
  } catch (error) {
    // A broken card should never cost the member their welcome message.
    appLogger.warn('Welcome card render failed', 'Welcome', {
      guildId: member.guild.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Text, optional embed and optional image card, shared by real joins and /welcome test. */
async function buildPayload(member: GuildMember, config: WelcomeConfig): Promise<MessageCreateOptions> {
  const content = buildWelcomeContent(member, config.message ?? DEFAULT_WELCOME_MESSAGE);
  const card = config.cardEnabled ? await buildCard(member, config.cardAccent) : null;
  const payload: MessageCreateOptions = {
    allowedMentions: { users: [member.id], roles: [], repliedUser: false },
    files: card ? [card] : [],
  };

  if (config.embedData && typeof config.embedData === 'object') {
    try {
      const raw = config.embedData as Record<string, unknown>;
      const embed = new EmbedBuilder(raw)
        .setDescription(buildWelcomeContent(member, String(raw.description ?? content)))
        .setColor(config.color ?? Colors.WELCOME);
      // The card takes the embed's image slot; a configured image is used only without a card.
      if (card) embed.setImage(`attachment://${CARD_NAME}`);
      else if (config.imageUrl) embed.setImage(config.imageUrl);
      payload.embeds = [embed];
      return payload;
    } catch (error) {
      appLogger.warn('Invalid welcome embed; falling back to text', 'Welcome', {
        guildId: member.guild.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  payload.content = content;
  return payload;
}

export const welcomeModule = {
  async sendPreview(member: GuildMember, channel: TextChannel, config: WelcomeConfig): Promise<void> {
    await channel.send(await buildPayload(member, config));
  },

  async handleMemberJoin(member: GuildMember): Promise<boolean> {
    const config = await guildService.getWelcomeConfig(member.guild.id);
    if (!config.enabled || !config.channelId) return false;

    const channel = member.guild.channels.cache.get(config.channelId);
    if (!(channel instanceof TextChannel)) {
      appLogger.warn('Configured welcome channel is unavailable', 'Welcome', {
        guildId: member.guild.id,
        channelId: config.channelId,
      });
      return false;
    }

    await channel.send(await buildPayload(member, config));
    return true;
  },
};
