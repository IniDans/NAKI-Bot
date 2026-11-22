import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type Message,
  type MessageActionRowComponentBuilder,
  type VoiceBasedChannel,
} from 'discord.js';
import { Colors } from '../../config/constants.js';
import { roomState, type RoomState } from './logic.js';

/**
 * The control panel posted in a temporary room's text chat. Component ids are
 * `tv:<action>:<channelId>`; see src/interactions/tempvoice.ts.
 */

const MAX_LISTED = 15;
/** channelId -> panel message id, so the panel can be refreshed after a change. */
const panelMessages = new Map<string, string>();

export function readRoomState(channel: VoiceBasedChannel, ownerId: string): RoomState {
  const overwrites = channel.permissionOverwrites.cache.map((o) => ({
    id: o.id,
    type: o.type,
    allow: o.allow.bitfield,
    deny: o.deny.bitfield,
  }));
  return roomState(overwrites, channel.guild.id, ownerId, channel.client.user.id);
}

function mentionList(ids: string[]): string {
  if (!ids.length) return 'None';
  const shown = ids.slice(0, MAX_LISTED).map((id) => `<@${id}>`).join(', ');
  return ids.length > MAX_LISTED ? `${shown} +${ids.length - MAX_LISTED} more` : shown;
}

export function panelEmbed(channel: VoiceBasedChannel, ownerId: string): EmbedBuilder {
  const state = readRoomState(channel, ownerId);
  const ownerHere = channel.members.has(ownerId);
  return new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle('🎛️ Voice Room Controls')
    .setDescription(
      `Only the room owner can use these controls.${ownerHere ? '' : '\n**The owner has left.** Anyone in the room can press **Claim** to take over.'}`,
    )
    .addFields(
      { name: 'Owner', value: `<@${ownerId}>`, inline: true },
      { name: 'Access', value: state.locked ? '🔒 Locked' : '🔓 Open', inline: true },
      { name: 'Visibility', value: state.hidden ? '🙈 Hidden' : '👁️ Visible', inline: true },
      { name: 'Chat', value: state.chatOff ? '🔇 Owner and trusted only' : '💬 Everyone', inline: true },
      { name: 'User Limit', value: channel.userLimit ? String(channel.userLimit) : 'No limit', inline: true },
      { name: 'Trusted', value: mentionList(state.trusted), inline: false },
      ...(state.blocked.length ? [{ name: 'Kicked (kept out)', value: mentionList(state.blocked), inline: false }] : []),
    );
}

export function panelComponents(channelId: string): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
  const button = (action: string, label: string, emoji: string, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(`tv:${action}:${channelId}`).setLabel(label).setEmoji(emoji).setStyle(style);
  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      button('name', 'Name', '✏️'),
      button('limit', 'Limit', '👥'),
      button('chat', 'Chat', '💬'),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`tv:privacy:${channelId}`)
        .setPlaceholder('🔐 Privacy')
        .addOptions(
          { label: 'Lock', description: 'Only trusted members can join', value: 'lock', emoji: '🔒' },
          { label: 'Unlock', description: 'Anyone can join', value: 'unlock', emoji: '🔓' },
          { label: 'Hide', description: 'Only trusted members can see the room', value: 'hide', emoji: '🙈' },
          { label: 'Show', description: 'Everyone can see the room', value: 'show', emoji: '👁️' },
        ),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      button('trust', 'Trust', '✅'),
      button('untrust', 'Untrust', '❌'),
      button('invite', 'Invite', '📨'),
      button('kick', 'Kick', '👢'),
    ),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      button('claim', 'Claim', '👑', ButtonStyle.Primary),
      button('transfer', 'Transfer', '🔁'),
    ),
  ];
}

export async function postPanel(channel: VoiceBasedChannel, ownerId: string): Promise<void> {
  const message = await channel.send({
    content: `<@${ownerId}>, this is your room. Manage it here:`,
    embeds: [panelEmbed(channel, ownerId)],
    components: panelComponents(channel.id),
    allowedMentions: { users: [ownerId] },
  });
  panelMessages.set(channel.id, message.id);
}

async function findPanel(channel: VoiceBasedChannel): Promise<Message | null> {
  const knownId = panelMessages.get(channel.id);
  if (knownId) {
    const known = await channel.messages.fetch(knownId).catch(() => null);
    if (known) return known;
  }
  // After a restart the id is gone: look for the bot's panel among recent messages.
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const found = recent?.find(
    (m) =>
      m.author.id === channel.client.user.id &&
      JSON.stringify(m.components.map((row) => row.toJSON())).includes(`"tv:name:${channel.id}"`),
  );
  if (found) panelMessages.set(channel.id, found.id);
  return found ?? null;
}

/** Bring the panel up to date after a change, posting a new one if it was deleted (unless told not to). */
export async function refreshPanel(channel: VoiceBasedChannel, ownerId: string, postIfMissing = true): Promise<void> {
  const panel = await findPanel(channel);
  if (panel) {
    await panel.edit({ embeds: [panelEmbed(channel, ownerId)], components: panelComponents(channel.id) });
  } else if (postIfMissing) {
    await postPanel(channel, ownerId);
  }
}

export function forgetPanel(channelId: string): void {
  panelMessages.delete(channelId);
}
